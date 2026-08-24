import { WebContentsView } from 'electron'

export function cleanUserAgent(defaultUA) {
  return String(defaultUA)
    .replace(/\s*Electron\/[^\s]+/gi, '')
    .replace(/\s*msg-hub\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function unreadFromTitle(title) {
  const hit = /^\((\d+)\)/.exec(String(title || '').trim())
  return hit ? Number(hit[1]) : 0
}

export function createView(account, defaultUA, onError = () => {}) {
  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:${account.id}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  view.webContents.setUserAgent(cleanUserAgent(defaultUA))

  // Spec section 8: a failed load must produce a visible message, not a blank window.
  // A rejection based on the User-Agent cannot be detected programmatically without
  // reading the page DOM, and that would break rule 7.2 — so the message names both
  // possible causes instead of guessing.
  view.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return // -3 = aborted by the user
    onError({ account, code, description, url })
  })

  view.webContents.loadURL(account.url)
  return view
}

export class ViewManager {
  constructor(window, defaultUA, onError = () => {}) {
    this.window = window
    this.defaultUA = defaultUA
    this.onError = onError
    this.views = new Map()
    this.activeId = null
    this.visible = true
    this.geometry = { x: 0, y: 0, width: 0, height: 0 }
  }

  add(account) {
    if (this.views.has(account.id)) return this.views.get(account.id)
    const view = createView(account, this.defaultUA, this.onError)
    view.setVisible(this.visible)
    this.window.contentView.addChildView(view)
    view.setBounds({ ...this.geometry, height: 0 })
    this.views.set(account.id, view)
    return view
  }

  remove(accountId) {
    const view = this.views.get(accountId)
    if (!view) return false
    this.window.contentView.removeChildView(view)
    // Listeners come off BEFORE closing — otherwise the closing view still manages
    // to fire a callback that reaches for an object which no longer exists.
    view.webContents.removeAllListeners('page-title-updated')
    view.webContents.removeAllListeners('did-fail-load')
    view.webContents.close()
    this.views.delete(accountId)
    if (this.activeId === accountId) {
      this.activeId = null
      const next = this.views.keys().next()
      if (!next.done) this.show(next.value)
    }
    return true
  }

  show(accountId) {
    if (!this.views.has(accountId)) return
    this.activeId = accountId
    for (const [id, view] of this.views) {
      view.setBounds(id === accountId ? this.geometry : { ...this.geometry, height: 0 })
    }
    this.views.get(accountId).webContents.focus()
  }

  setGeometry(rect) {
    this.geometry = rect
    if (this.activeId) this.show(this.activeId)
  }

  // Account views are a native layer ABOVE the renderer, so every renderer dialog
  // would vanish underneath them. The whole layer steps aside while a dialog is open.
  setVisibility(visible) {
    this.visible = Boolean(visible)
    for (const view of this.views.values()) view.setVisible(this.visible)
  }

  active() {
    return this.activeId ? this.views.get(this.activeId) ?? null : null
  }

  all() {
    return this.views
  }

  // The channel rail shows a count next to EVERY account, so a bare total is not enough.
  unreadByAccount() {
    const result = {}
    for (const [id, view] of this.views) {
      if (view.webContents.isDestroyed()) continue
      result[id] = unreadFromTitle(view.webContents.getTitle())
    }
    return result
  }

  unreadTotal() {
    return Object.values(this.unreadByAccount()).reduce((sum, n) => sum + n, 0)
  }
}
