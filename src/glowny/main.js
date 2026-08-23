import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { czystyUserAgent, ZarzadcaWidokow } from './widoki.js'
import { wczytajUklad, zapiszUklad } from './powloka.js'
import { wczytajKonta } from './konta.js'
import { zarejestrujKanalyKont, zarejestrujKanalyMakr } from './most.js'
import { utworzSesjeSchowka } from './schowek-pliku.js'

const KATALOG = path.dirname(fileURLToPath(import.meta.url))
const WYSOKOSC_PASKA = 44

app.userAgentFallback = czystyUserAgent(app.userAgentFallback)

// Domyslne menu Electrona (File/Edit/View/Window) nie nalezy do tej aplikacji
// i na Windowsie zjada pasek wewnatrz obszaru klienta.
Menu.setApplicationMenu(null)

let okno
let zasobnik
let zarzadca
let sesjaSchowka

async function utworzOkno() {
  const katalogDanych = app.getPath('userData')
  const plikUkladu = path.join(katalogDanych, 'uklad.json')
  const uklad = await wczytajUklad(plikUkladu)

  okno = new BrowserWindow({
    width: uklad.szerokosc,
    height: uklad.wysokosc,
    x: uklad.x,
    y: uklad.y,
    minWidth: 800,
    minHeight: 600,
    title: 'msg-hub',
    backgroundColor: '#111b21',
    webPreferences: { preload: path.join(KATALOG, '..', 'preload', 'preload.cjs') },
  })
  okno.setTitle('msg-hub')
  if (uklad.zmaksymalizowane) okno.maximize()

  // Bez menu nie ma pozycji "Toggle Developer Tools" — skrot zostaje, bo przy
  // diagnostyce strony komunikatora jest jedynym wgladem w konsole.
  okno.webContents.on('before-input-event', (_zdarzenie, wejscie) => {
    const devtools =
      wejscie.key === 'F12' || (wejscie.control && wejscie.shift && wejscie.key.toLowerCase() === 'i')
    if (wejscie.type === 'keyDown' && devtools) {
      const cel = zarzadca?.aktywny()?.webContents ?? okno.webContents
      cel.toggleDevTools()
    }
  })

  // Komunikaty ida do paska w oknie, nie do modalnego okienka systemowego.
  // Modal zatrzymuje calą aplikacje i wymaga klikniecia, a blad ladowania jednego
  // konta nie powinien blokowac pozostalych.
  const pokazKomunikat = (tekst) => {
    if (!okno.webContents.isDestroyed()) okno.webContents.send('komunikat:pokaz', tekst)
  }

  zarzadca = new ZarzadcaWidokow(okno, app.userAgentFallback, ({ konto, kod, opis }) => {
    pokazKomunikat(
      `Nie udalo sie zaladowac konta ${konto.nazwa} — blad ${kod}: ${opis}. ` +
        'Jesli siec dziala, a strona odmawia obslugi klienta, zaktualizuj Electrona ' +
        '(npm install electron@latest) — WhatsApp Web wymaga swiezej wersji Chromium.',
    )
  })

  const dopasuj = () => {
    const { width, height } = okno.getContentBounds()
    zarzadca.dopasujGeometrie({ x: 0, y: WYSOKOSC_PASKA, width, height: height - WYSOKOSC_PASKA })
  }
  okno.on('resize', dopasuj)

  // app.setBadgeCount dziala tylko na Linuksie i macOS. Na Windowsie licznik pokazuje
  // nakladka na ikonie paska zadan, a ta wymaga obrazka 16x16 — rysuje go renderer
  // i odsyla kanalem licznik:nakladka. Tytul okna i podpowiedz zasobnika sa zapasem,
  // widocznym nawet gdy nakladka nie wejdzie.
  const odswiezBadge = () => {
    const suma = zarzadca.sumaNieprzeczytanych()
    okno.setTitle(suma ? `msg-hub (${suma})` : 'msg-hub')
    zasobnik?.setToolTip(suma ? `msg-hub — ${suma} nieprzeczytanych` : 'msg-hub')
    if (!okno.webContents.isDestroyed()) okno.webContents.send('licznik:zmiana', suma)
  }

  ipcMain.handle('licznik:nakladka', (_zdarzenie, obrazek) => {
    okno.setOverlayIcon(
      obrazek ? nativeImage.createFromDataURL(obrazek) : null,
      obrazek ? 'nieprzeczytane wiadomosci' : '',
    )
  })

  const przygotujWidok = (widok) => {
    widok.webContents.session.setPermissionRequestHandler((_wc, uprawnienie, przyznaj) => {
      przyznaj(uprawnienie === 'notifications')
    })
    widok.webContents.on('page-title-updated', odswiezBadge)
  }

  // KOLEJNOSC JEST ISTOTNA: renderer wola konta:lista natychmiast po zaladowaniu,
  // wiec widoki i kanaly IPC musza stac PRZED loadFile. Odwrotna kolejnosc daje
  // "No handler registered for 'konta:lista'" i pusty pasek zakladek.
  const { konta } = await wczytajKonta(path.join(katalogDanych, 'accounts.json'))
  for (const konto of konta) przygotujWidok(zarzadca.dodaj(konto))
  dopasuj()
  if (konta.length) zarzadca.pokaz(konta[0].id)

  zarejestrujKanalyKont({ katalogDanych, zarzadca, poDodaniuKonta: dopasuj, przygotujWidok })
  sesjaSchowka = utworzSesjeSchowka()
  sesjaSchowka.rozgrzej()
  zarejestrujKanalyMakr({ katalogDanych, zarzadca, sesjaSchowka })

  await okno.loadFile(path.join(KATALOG, '..', 'renderer', 'index.html'))
  odswiezBadge()

  // Zapis ukladu musi sie ZAKONCZYC przed zamknieciem okna — inaczej app.quit()
  // ucina asynchroniczny zapis i pozycja okna nie przezywa restartu.
  let ukladZapisany = false
  okno.on('close', (zdarzenie) => {
    if (ukladZapisany) return
    zdarzenie.preventDefault()
    const prostokat = okno.getNormalBounds()
    zapiszUklad(plikUkladu, {
      x: prostokat.x,
      y: prostokat.y,
      szerokosc: prostokat.width,
      wysokosc: prostokat.height,
      zmaksymalizowane: okno.isMaximized(),
    }).finally(() => {
      ukladZapisany = true
      okno.destroy()
    })
  })
}

function utworzZasobnik() {
  zasobnik = new Tray(nativeImage.createEmpty())
  zasobnik.setToolTip('msg-hub')
  zasobnik.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Pokaz', click: () => okno?.show() },
      { type: 'separator' },
      { label: 'Zakoncz', click: () => app.quit() },
    ]),
  )
  zasobnik.on('click', () => (okno?.isVisible() ? okno.hide() : okno?.show()))
}

app.whenReady().then(async () => {
  await utworzOkno()
  utworzZasobnik()
})

app.on('before-quit', () => sesjaSchowka?.zamknij())

app.on('window-all-closed', () => app.quit())
