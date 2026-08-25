import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, shell, powerMonitor } from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cleanUserAgent, ViewManager } from './views.js'
import { loadLayout, saveLayout, setAutoStart, acceptHoverReport, HIDDEN_FLAG } from './shell.js'
import { loadAccounts, PLATFORMS, notificationsAllowed } from './accounts.js'
import { classify } from './navigation.js'
import { registerAccountChannels, registerMacroChannels } from './bridge.js'
import { createClipboardSession } from './file-clipboard.js'
import { createLogger } from './log.js'
import { t, validLanguage } from '../shared/i18n.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Console geometry. The channel rail stands on the left, the status bar along the
// bottom, and the account view sits INSIDE the frame the renderer draws — the margin
// leaves room for the edge painted in the active account's colour.
//
// An unpinned rail collapses to bare channel colours and expands when the cursor
// enters it. Expanding PUSHES the account view aside instead of covering it: account
// views are a native layer ABOVE the renderer, so an overlay drawn in HTML would hide
// underneath the messenger page. A true overlay would need its own native view.
const RAIL_COLLAPSED = 48
const RAIL_EXPANDED = 162
const STATUS_BAR_HEIGHT = 30
const WELL_MARGIN = 10
const ICON_PATH = path.join(HERE, '..', 'renderer', 'icon.png')
const MACRO_SHORTCUT = 'Control+Shift+Space'

app.userAgentFallback = cleanUserAgent(app.userAgentFallback)

// Windows attributes a toast to an application by this identifier, and until now it lived
// only in the electron-builder configuration — that is, in the installer, not in the running
// process. Electron exposes a setter and no getter, so this one is verified by reading it
// rather than by a test.
app.setAppUserModelId('pl.kencki.msghub')

// Electron's default menu (File/Edit/View/Window) does not belong to this app and on
// Windows it eats a strip inside the client area.
Menu.setApplicationMenu(null)

let window
let tray
let manager
let clipboardSession
let logger
let logDir
// Closing the window hides it; only a deliberate Quit ends the process. Without this flag
// the close handler could not tell the two apart and Quit would hide the window forever.
let quitting = false

// Interface language. The main process owns the stored value, while the list of
// languages lives in src/shared/i18n.js. The tray menu and load errors are main-process
// surfaces, so they need translating here too.
let language = 'en'
const tr = (key, params) => t(language, key, params)

async function createWindow() {
  const dataDir = app.getPath('userData')
  logDir = path.join(dataDir, 'logs')
  logger = createLogger(logDir)
  logger.write('started', { count: 0 })
  const layoutFile = path.join(dataDir, 'layout.json')
  // Schema version 1 kept this file under a Polish name. Reading the old one when the
  // new one is absent keeps the window position, the pinned rail and the chosen
  // language across the upgrade; the next save writes the new name.
  const legacyLayoutFile = path.join(dataDir, 'uklad.json')
  const layout = await loadLayout(existsSync(layoutFile) ? layoutFile : legacyLayoutFile)
  language = validLanguage(layout.language)

  // The login item passes --hidden. The window is therefore built unshown rather than shown
  // and hidden a moment later, which would flash across the screen at every login.
  const startHidden = process.argv.includes(HIDDEN_FLAG)

  window = new BrowserWindow({
    show: !startHidden,
    width: layout.width,
    height: layout.height,
    x: layout.x,
    y: layout.y,
    minWidth: 800,
    minHeight: 600,
    title: 'msg-hub',
    icon: ICON_PATH,
    backgroundColor: '#111b21',
    webPreferences: { preload: path.join(HERE, '..', 'preload', 'preload.cjs') },
  })
  window.setTitle('msg-hub')
  if (layout.maximized) window.maximize()

  // An account view is a native layer ABOVE the renderer: while it holds focus — which
  // is most of the working time — the keyboard never reaches the main window and the
  // renderer's shortcuts are dead. The interceptor is therefore attached to EVERY
  // webContents, not just the window. With no menu there is also no "Toggle Developer
  // Tools" item, so F12 is the only way into the messenger page's console.
  const attachShortcuts = (webContents) => {
    webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return

      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        const target = manager?.active()?.webContents ?? window.webContents
        target.toggleDevTools()
        return
      }

      // The same key inside the app's own window would tear down the interface, the rail
      // and the status bar along with it, so it never means what it usually means: it
      // always reloads the account being looked at.
      if (input.control && !input.shift && !input.alt && input.key.toLowerCase() === 'r') {
        _event.preventDefault()
        if (manager.activeId) manager.reload(manager.activeId)
        return
      }

      // Reaching an account without the mouse. The rail's channels are real buttons, but
      // in normal use the keyboard is inside an account page, where Tab never gets to
      // them. The renderer is asked to switch rather than the manager being told directly:
      // it already owns switching, and going round it would leave the rail highlighting
      // the account the operator just left. Services grab Ctrl+digit for themselves —
      // Discord does — so the key is taken out of the page's reach.
      if (input.control && !input.shift && !input.alt && /^[1-9]$/.test(input.key)) {
        _event.preventDefault()
        window.webContents.send('accounts:select', Number(input.key) - 1)
        return
      }

      // Ctrl+; pressed in the main window is handled by the renderer's own listener on
      // window. Here we intercept only the key that landed in an account view —
      // otherwise the same shortcut would fire twice.
      if (input.control && input.key === ';' && webContents !== window.webContents) {
        // The panel is drawn by the main window's renderer — and focus has to return
        // there too, or the operator opens the panel and cannot type in it.
        window.webContents.focus()
        window.webContents.send('macros:open')
      }
    })
  }

  attachShortcuts(window.webContents)

  // Messages go to the status bar inside the window, not to a modal system dialog.
  // A modal freezes the whole application and demands a click, and one account failing
  // to load should not block the others.
  // A message may carry an OFFER: something the operator can act on from the status bar. It
  // is an offer and not an action because the only thing on offer here — reloading — throws
  // away whatever is half-typed in a composer.
  const showMessage = (text, offer = null) => {
    if (!window.webContents.isDestroyed()) window.webContents.send('message:show', { text, offer })
  }

  manager = new ViewManager(window, app.userAgentFallback, ({ account, code, description }) => {
    // The description comes from Chromium and names a failure, not a page — ERR_NAME_NOT_
    // RESOLVED and its kin. It is the one string here worth keeping.
    logger.write('account-load-failed', { account: account.id, platform: account.platform, code, reason: description })
    showMessage(tr('loadAccountFailed', { account: account.name, code, description }), {
      action: 'reload',
      accountId: account.id,
    })
  })

  let closeToTray = Boolean(layout.closeToTray)
  let railPinned = Boolean(layout.railPinned)
  let railHovered = false
  const railExpanded = () => railPinned || railHovered

  const fitViews = () => {
    const { width, height } = window.getContentBounds()
    const rail = railExpanded() ? RAIL_EXPANDED : RAIL_COLLAPSED
    manager.setGeometry({
      x: rail + WELL_MARGIN,
      y: WELL_MARGIN,
      width: Math.max(0, width - rail - WELL_MARGIN * 2),
      height: Math.max(0, height - STATUS_BAR_HEIGHT - WELL_MARGIN * 2),
    })
  }

  const railState = () => ({ pinned: railPinned, expanded: railExpanded() })

  const broadcastRailState = () => {
    if (!window.webContents.isDestroyed()) window.webContents.send('rail:changed', railState())
  }

  // The main process is the single owner of the rail state: it computes the geometry of
  // the views, so the renderer only reports events and receives a finished decision.
  ipcMain.handle('rail:state', () => railState())

  // Not every mouseleave the renderer reports means the pointer left — see
  // acceptHoverReport in shell.js, where the rule and the measurement behind it live.
  ipcMain.handle('rail:hover', (_event, hovered, pointerStillInside) => {
    if (!acceptHoverReport({ hovered, pointerStillInside, windowFocused: window.isFocused() })) return
    railHovered = Boolean(hovered)
    fitViews()
    broadcastRailState()
  })

  ipcMain.handle('rail:pin', (_event, pinned) => {
    railPinned = Boolean(pinned)
    fitViews()
    broadcastRailState()
  })
  window.on('resize', fitViews)

  // acceptHoverReport holds back a leave reported from inside the rail while the window was
  // in the background — but holding one back loses it, and Chromium sends no second one
  // once it considers the pointer gone. So the moment the window is back in front, ask the
  // renderer where the pointer actually is now instead of living on the stale answer.
  window.on('focus', () => {
    if (!window.webContents.isDestroyed()) window.webContents.send('rail:recheck')
  })

  const currentLayout = () => {
    const rect = window.getNormalBounds()
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      maximized: window.isMaximized(),
      railPinned,
      closeToTray,
      language,
    }
  }

  ipcMain.handle('accounts:reload', (_event, accountId) => manager.reload(accountId ?? manager.activeId))

  ipcMain.handle('closeToTray:get', () => closeToTray)

  // Written straight away like the language, and for the same reason: a rare deliberate
  // choice that must not be lost to a killed process.
  ipcMain.handle('closeToTray:set', async (_event, next) => {
    closeToTray = Boolean(next)
    await saveLayout(layoutFile, currentLayout(), legacyLayoutFile).catch(() => {})
    return closeToTray
  })

  ipcMain.handle('language:get', () => language)

  // Written to disk IMMEDIATELY, not only on close: choosing a language is a rare,
  // deliberate act, and losing it to a killed process would be visible from the very
  // first launch after installation. The tray menu is rebuilt because it is a
  // main-process surface the renderer cannot repaint.
  ipcMain.handle('language:set', async (_event, next) => {
    language = validLanguage(next)
    buildTray()
    refreshBadge()
    await saveLayout(layoutFile, currentLayout(), legacyLayoutFile).catch(() => {})
    return language
  })

  // app.setBadgeCount works only on Linux and macOS. On Windows the count is shown by an
  // overlay on the taskbar icon, and that needs a 16x16 image — the renderer draws it and
  // sends it back over unread:overlay. The window title and tray tooltip are the fallback,
  // visible even when the overlay does not take.
  const refreshBadge = () => {
    // Account views emit page-title-updated while the application is closing too, when
    // the window is already gone. Without this guard Electron raises "Object has been
    // destroyed" in a modal error dialog that blocks the process from exiting.
    if (!window || window.isDestroyed()) return
    const byAccount = manager.unreadByAccount()
    const total = Object.values(byAccount).reduce((sum, n) => sum + n, 0)
    window.setTitle(total ? `msg-hub (${total})` : 'msg-hub')
    tray?.setToolTip(total ? tr('trayUnread', { n: total }) : 'msg-hub')
    // The renderer also gets the per-account breakdown — the rail shows a count on each.
    if (!window.webContents.isDestroyed()) window.webContents.send('unread:changed', { total, byAccount })
  }

  ipcMain.handle('unread:overlay', (_event, image) => {
    window.setOverlayIcon(
      image ? nativeImage.createFromDataURL(image) : null,
      image ? tr('overlayUnread') : '',
    )
  })

  // Until this existed a link in a conversation opened a BARE Electron window: no address
  // bar, no back, no reload, and inside the account's signed-in session — measured, the
  // popup's session was the very same object as the view's. Which decision an address gets
  // is navigation.js's business; this is only the wiring.
  const gateNavigation = (view, account) => {
    const platform = PLATFORMS[account.platform]

    const sendOut = (address) => {
      shell.openExternal(address).catch(() => {})
    }

    view.webContents.setWindowOpenHandler((details) => {
      const verdict = classify(platform, details.url, { viaWindowOpen: true })
      if (verdict === 'external') sendOut(details.url)
      if (verdict !== 'child') return { action: 'deny' }

      return {
        action: 'allow',
        // The child window must not outlive the page that opened it: sign-in flows answer
        // back to their opener, and one left behind is a signed-in window with no owner.
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          parent: window,
          width: 520,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      }
    })

    view.webContents.on('did-create-window', (child, details) => {
      // A window with no address bar must not be able to call itself something it is not,
      // so its title is the origin and the page may not change it. The first argument here
      // is a BrowserWindow, not a webContents.
      let origin = 'about:blank'
      try {
        origin = new URL(details.url).origin
      } catch {
        // Leave the placeholder: an address we cannot parse is exactly the case where a
        // page-chosen title would be doing the talking.
      }
      child.setTitle(origin)
      // The listener belongs on the WINDOW, not on its webContents: it is the window's
      // event whose preventDefault stops the native title from being applied. Attached to
      // the webContents the call is accepted and does nothing, which is how a guard comes
      // to look like it works.
      child.on('page-title-updated', (event) => event.preventDefault())
    })

    // Only will-navigate, deliberately. A redirect is the continuation of a navigation that
    // was already allowed, and sign-in flows legitimately pass through hosts nobody can
    // enumerate in advance — gating those would break the sign-in rather than protect it.
    // The rule is where a navigation CAME FROM, not where it is heading.
    view.webContents.on('will-navigate', (event, address) => {
      const verdict = classify(platform, address)
      if (verdict === 'view') return
      event.preventDefault()
      if (verdict === 'external') sendOut(address)
    })

    // Registered on the account's own partition rather than on the default session, because
    // on the default session there is no way to tell whose file is arriving.
    view.webContents.session.on('will-download', (_event, item) => {
      showMessage(tr('downloadStarted', { account: account.name, file: item.getFilename() }))
    })
  }

  const prepareView = (view, account) => {
    // The account object is re-read rather than captured, so turning notifications off in
    // Settings takes effect on the next request instead of on the next restart. A page asks
    // once and remembers the answer, so a refusal also needs the page reloading — which the
    // status bar offers anyway.
    view.webContents.session.setPermissionRequestHandler(async (_wc, permission, grant) => {
      if (permission !== 'notifications') return grant(false)
      const { accounts } = await loadAccounts(path.join(dataDir, 'accounts.json'))
      grant(notificationsAllowed(accounts.find((a) => a.id === account.id) ?? account))
    })
    view.webContents.on('page-title-updated', refreshBadge)
    attachShortcuts(view.webContents)
    gateNavigation(view, account)

    // Clicking a Windows toast hands focus to the view the toast came from, and nothing
    // else moved with it: the rail went on showing the account the operator had walked
    // away from, and the conversation they were sent to opened inside a view zero pixels
    // tall. The renderer is asked to switch, for the same reason as Ctrl+1..9 — it owns
    // switching, and going round it desynchronises the rail.
    //
    // show() ends by focusing the view it just showed, so answering every focus event
    // would be a loop that never stops. A view that is already current asks for nothing.

    // A dead renderer shows a blank rectangle and nothing else. Saying so, and saying which
    // account it happened to, is the difference between a bug report and a restart.
    view.webContents.on('render-process-gone', (_event, details) => {
      logger.write('account-crashed', { account: account.id, reason: details.reason })
      showMessage(tr('accountCrashed', { account: account.name, reason: details.reason }), {
        action: 'reload',
        accountId: account.id,
      })
    })

    view.webContents.on('unresponsive', () => {
      logger.write('account-unresponsive', { account: account.id })
      showMessage(tr('accountUnresponsive', { account: account.name }), {
        action: 'reload',
        accountId: account.id,
      })
    })

    // A view also takes the system's focus while it is being created, and that is not a
    // notification click: measured, two accounts produced two such events, both from a
    // webContents still loading with an empty URL, and which account came out current was
    // left to whichever landed last. A toast cannot come from a page that has never
    // loaded, so nothing is routed until the first load has finished, one way or the other.
    let loadSettled = false
    view.webContents.once('did-stop-loading', () => {
      loadSettled = true
    })

    view.webContents.on('focus', () => {
      if (!loadSettled) return
      if (manager.activeId === account.id) return
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
      window.webContents.send('accounts:select-id', account.id)
    })
  }

  // ORDER MATTERS: the renderer calls accounts:list the moment it loads, so the views
  // and the IPC channels must stand BEFORE loadFile. The other way round yields
  // "No handler registered for 'accounts:list'" and an empty rail.
  const { accounts } = await loadAccounts(path.join(dataDir, 'accounts.json'))
  for (const account of accounts) prepareView(manager.add(account), account)
  fitViews()
  if (accounts.length) manager.show(accounts[0].id)

  registerAccountChannels({ dataDir, manager, onAccountsChanged: fitViews, prepareView })
  clipboardSession = createClipboardSession()
  clipboardSession.warmUp()
  registerMacroChannels({ dataDir, manager, clipboardSession })

  await window.loadFile(path.join(HERE, '..', 'renderer', 'index.html'))
  refreshBadge()

  // A laptop coming back from sleep leaves the services believing the computer is gone.
  // Reloading by itself would throw away whatever the operator was in the middle of typing
  // before the lid closed, so waking only says the accounts may need it.
  powerMonitor.on('resume', () => {
    logger.write('woke-up', {})
    if (!manager.activeId) return
    showMessage(tr('wokeUp'), { action: 'reload', accountId: manager.activeId })
  })

  // The one shortcut that has to work when the app is not in front at all — that is the
  // whole point of a macro palette for someone typing in another program. register()
  // answers with a boolean and says nothing when another program already owns the
  // combination, and silence would look exactly like a shortcut that works.
  const claimed = globalShortcut.register(MACRO_SHORTCUT, () => {
    if (!window || window.isDestroyed()) return
    if (!window.isVisible()) window.show()
    if (window.isMinimized()) window.restore()
    window.focus()
    window.webContents.focus()
    window.webContents.send('macros:open')
  })
  if (!claimed) {
    logger.write('global-shortcut-refused', {})
    showMessage(tr('shortcutTaken', { shortcut: MACRO_SHORTCUT }))
  }

  // Saving the layout must FINISH before the window closes — otherwise app.quit() cuts
  // the asynchronous write short and the window position does not survive a restart. The
  // same write has to happen on the way to the tray, because from there the process may
  // well end without another close ever being seen.
  let layoutSaved = false
  window.on('close', (event) => {
    if (layoutSaved) return
    event.preventDefault()
    const goingToTray = closeToTray && !quitting
    saveLayout(layoutFile, currentLayout(), legacyLayoutFile).finally(() => {
      if (goingToTray) {
        window.hide()
        return
      }
      layoutSaved = true
      window.destroy()
    })
  })
}

// Rebuilt rather than mutated, because Electron's Menu is immutable once set — this is
// also how the tray follows a language change.
function buildTray() {
  if (!tray) {
    // An empty tray icon is INVISIBLE on Windows — it has to be a real image.
    tray = new Tray(nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 }))
    tray.setToolTip('msg-hub')
    tray.on('click', () => (window?.isVisible() ? window.hide() : window?.show()))
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: tr('trayShow'), click: () => window?.show() },
      {
        label: tr('trayAutoStart'),
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setAutoStart(item.checked, app),
      },
      {
        // The log only earns its keep if the person it is for can find it. Everything in it
        // is written by this app and is safe to send on — see src/main/log.js.
        label: tr('trayOpenLogs'),
        click: () => {
          if (logDir) shell.openPath(logDir)
        },
      },
      { type: 'separator' },
      {
        label: tr('trayQuit'),
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
}

// Two copies over one profile is not a tidiness problem: each keeps its own picture of the
// cookie stores, and whichever loses the write loses its sign-in. On WhatsApp that means
// scanning a QR code again, and which copy loses is not predictable. The lock has to be
// taken BEFORE whenReady, or the second copy gets far enough to build a window first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Launching again is someone asking to see the app, and usually it is in the tray.
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return
    if (!window.isVisible()) window.show()
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(async () => {
    await createWindow()
    buildTray()
  })
}

// Anything that ends the application — the tray menu, a session ending, a task manager —
// arrives here first, and from here on a close means a close.
app.on('before-quit', () => {
  quitting = true
  globalShortcut.unregisterAll()
  clipboardSession?.close()
})

app.on('window-all-closed', () => app.quit())
