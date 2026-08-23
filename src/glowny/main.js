import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { czystyUserAgent, ZarzadcaWidokow } from './widoki.js'
import { wczytajUklad, zapiszUklad } from './powloka.js'
import { wczytajKonta } from './konta.js'
import { zarejestrujKanalyKont } from './most.js'

const KATALOG = path.dirname(fileURLToPath(import.meta.url))
const WYSOKOSC_PASKA = 44

app.userAgentFallback = czystyUserAgent(app.userAgentFallback)

let okno
let zasobnik
let zarzadca

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
  await okno.loadFile(path.join(KATALOG, '..', 'renderer', 'index.html'))

  zarzadca = new ZarzadcaWidokow(okno, app.userAgentFallback, ({ konto, kod, opis }) => {
    dialog.showErrorBox(
      `Nie udalo sie zaladowac konta ${konto.nazwa}`,
      `Blad ${kod}: ${opis}\n\n` +
        'Jesli siec dziala, a strona odmawia obslugi klienta, zaktualizuj aplikacje ' +
        '(npm install electron@latest) — WhatsApp Web wymaga swiezej wersji Chromium.',
    )
  })

  const dopasuj = () => {
    const { width, height } = okno.getContentBounds()
    zarzadca.dopasujGeometrie({ x: 0, y: WYSOKOSC_PASKA, width, height: height - WYSOKOSC_PASKA })
  }
  okno.on('resize', dopasuj)

  const { konta } = await wczytajKonta(path.join(katalogDanych, 'accounts.json'))
  for (const konto of konta) zarzadca.dodaj(konto)
  dopasuj()
  if (konta.length) zarzadca.pokaz(konta[0].id)

  zarejestrujKanalyKont({ katalogDanych, zarzadca, poDodaniuKonta: dopasuj })

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

app.on('window-all-closed', () => app.quit())
