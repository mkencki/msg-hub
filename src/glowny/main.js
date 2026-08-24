import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { czystyUserAgent, ZarzadcaWidokow } from './widoki.js'
import { wczytajUklad, zapiszUklad, ustawAutostart } from './powloka.js'
import { wczytajKonta } from './konta.js'
import { zarejestrujKanalyKont, zarejestrujKanalyMakr } from './most.js'
import { utworzSesjeSchowka } from './schowek-pliku.js'

const KATALOG = path.dirname(fileURLToPath(import.meta.url))
// Geometria konsoli. Szyna kanalow stoi po lewej, listwa stanu na dole, a widok
// konta siedzi WEWNATRZ ramki rysowanej przez renderer — margines zostawia miejsce
// na krawedz w kolorze aktywnego konta.
const SZEROKOSC_SZYNY = 162
const WYSOKOSC_LISTWY = 30
const MARGINES_STUDNI = 10
const SCIEZKA_IKONY = path.join(KATALOG, '..', 'renderer', 'ikona.png')

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
    icon: SCIEZKA_IKONY,
    backgroundColor: '#111b21',
    webPreferences: { preload: path.join(KATALOG, '..', 'preload', 'preload.cjs') },
  })
  okno.setTitle('msg-hub')
  if (uklad.zmaksymalizowane) okno.maximize()

  // Widok konta to natywna warstwa NAD rendererem: kiedy trzyma fokus — czyli
  // przez wiekszosc pracy — klawiatura nie dociera do okna glownego i skroty
  // renderera sa martwe. Dlatego przechwytywacz dostaje KAZDY webContents,
  // a nie tylko okno. Bez menu nie ma tez pozycji "Toggle Developer Tools",
  // wiec F12 jest jedynym wgladem w konsole strony komunikatora.
  const podepnijSkroty = (webContents) => {
    webContents.on('before-input-event', (_zdarzenie, wejscie) => {
      if (wejscie.type !== 'keyDown') return

      if (wejscie.key === 'F12' || (wejscie.control && wejscie.shift && wejscie.key.toLowerCase() === 'i')) {
        const cel = zarzadca?.aktywny()?.webContents ?? okno.webContents
        cel.toggleDevTools()
        return
      }

      // Ctrl+; wcisniety w oknie glownym obsluguje renderer wlasnym nasluchem
      // na window. Tutaj przechwytujemy wylacznie klawisz, ktory trafil do
      // widoku konta — inaczej ten sam skrot zadzialalby dwa razy.
      if (wejscie.control && wejscie.key === ';' && webContents !== okno.webContents) {
        // Panel rysuje renderer okna glownego — i tam tez musi wrocic fokus,
        // inaczej operator otwiera panel i nie moze w nim pisac.
        okno.webContents.focus()
        okno.webContents.send('makra:otworz')
      }
    })
  }

  podepnijSkroty(okno.webContents)

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
    zarzadca.dopasujGeometrie({
      x: SZEROKOSC_SZYNY + MARGINES_STUDNI,
      y: MARGINES_STUDNI,
      width: Math.max(0, width - SZEROKOSC_SZYNY - MARGINES_STUDNI * 2),
      height: Math.max(0, height - WYSOKOSC_LISTWY - MARGINES_STUDNI * 2),
    })
  }
  okno.on('resize', dopasuj)

  // app.setBadgeCount dziala tylko na Linuksie i macOS. Na Windowsie licznik pokazuje
  // nakladka na ikonie paska zadan, a ta wymaga obrazka 16x16 — rysuje go renderer
  // i odsyla kanalem licznik:nakladka. Tytul okna i podpowiedz zasobnika sa zapasem,
  // widocznym nawet gdy nakladka nie wejdzie.
  const odswiezBadge = () => {
    // Widoki kont emituja page-title-updated takze w trakcie zamykania aplikacji,
    // gdy okna juz nie ma. Bez tej straznicy leci "Object has been destroyed"
    // w modalnym oknie bledu Electrona, ktore blokuje zamkniecie procesu.
    if (!okno || okno.isDestroyed()) return
    const wgKont = zarzadca.licznikiKont()
    const suma = Object.values(wgKont).reduce((razem, ile) => razem + ile, 0)
    okno.setTitle(suma ? `msg-hub (${suma})` : 'msg-hub')
    zasobnik?.setToolTip(suma ? `msg-hub — ${suma} nieprzeczytanych` : 'msg-hub')
    // Renderer dostaje takze rozbicie na konta — szyna pokazuje licznik przy kazdym.
    if (!okno.webContents.isDestroyed()) okno.webContents.send('licznik:zmiana', { suma, wgKont })
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
    podepnijSkroty(widok.webContents)
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
  // Pusta ikona zasobnika jest na Windowsie NIEWIDOCZNA — musi byc realny obrazek.
  zasobnik = new Tray(nativeImage.createFromPath(SCIEZKA_IKONY).resize({ width: 16, height: 16 }))
  zasobnik.setToolTip('msg-hub')
  zasobnik.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Pokaz', click: () => okno?.show() },
      {
        label: 'Uruchamiaj z Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (pozycja) => ustawAutostart(pozycja.checked, app),
      },
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
