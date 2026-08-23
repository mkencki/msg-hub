import { WebContentsView } from 'electron'

export function czystyUserAgent(domyslnyUA) {
  return String(domyslnyUA)
    .replace(/\s*Electron\/[^\s]+/gi, '')
    .replace(/\s*msg-hub\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function licznikZTytulu(tytul) {
  const trafienie = /^\((\d+)\)/.exec(String(tytul || '').trim())
  return trafienie ? Number(trafienie[1]) : 0
}

export function utworzWidok(konto, domyslnyUA, przyBledzie = () => {}) {
  const widok = new WebContentsView({
    webPreferences: {
      partition: `persist:${konto.id}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  widok.webContents.setUserAgent(czystyUserAgent(domyslnyUA))

  // Spec sekcja 8: nieudane ladowanie ma dac jawny komunikat, nie puste okno.
  // Odrzucenia po User-Agent nie da sie wykryc programowo bez czytania DOM strony,
  // a to lamaloby regule 7.2 — dlatego komunikat wskazuje obie mozliwe przyczyny.
  widok.webContents.on('did-fail-load', (_zdarzenie, kod, opis, adres, glowneOkno) => {
    if (!glowneOkno || kod === -3) return // -3 = przerwane przez uzytkownika
    przyBledzie({ konto, kod, opis, adres })
  })

  widok.webContents.loadURL(konto.url)
  return widok
}

export class ZarzadcaWidokow {
  constructor(okno, domyslnyUA, przyBledzie = () => {}) {
    this.okno = okno
    this.domyslnyUA = domyslnyUA
    this.przyBledzie = przyBledzie
    this.widoki = new Map()
    this.idAktywnego = null
    this.widocznosc = true
    this.geometria = { x: 0, y: 0, width: 0, height: 0 }
  }

  dodaj(konto) {
    if (this.widoki.has(konto.id)) return this.widoki.get(konto.id)
    const widok = utworzWidok(konto, this.domyslnyUA, this.przyBledzie)
    widok.setVisible(this.widocznosc)
    this.okno.contentView.addChildView(widok)
    widok.setBounds({ ...this.geometria, height: 0 })
    this.widoki.set(konto.id, widok)
    return widok
  }

  usun(idKonta) {
    const widok = this.widoki.get(idKonta)
    if (!widok) return false
    this.okno.contentView.removeChildView(widok)
    // Nasluchy zdejmujemy PRZED zamknieciem — inaczej zamykany widok zdazy
    // jeszcze wywolac zwrotke, ktora siegnie po juz nieistniejacy obiekt.
    widok.webContents.removeAllListeners('page-title-updated')
    widok.webContents.removeAllListeners('did-fail-load')
    widok.webContents.close()
    this.widoki.delete(idKonta)
    if (this.idAktywnego === idKonta) {
      this.idAktywnego = null
      const nastepny = this.widoki.keys().next()
      if (!nastepny.done) this.pokaz(nastepny.value)
    }
    return true
  }

  pokaz(idKonta) {
    if (!this.widoki.has(idKonta)) return
    this.idAktywnego = idKonta
    for (const [id, widok] of this.widoki) {
      widok.setBounds(id === idKonta ? this.geometria : { ...this.geometria, height: 0 })
    }
    this.widoki.get(idKonta).webContents.focus()
  }

  dopasujGeometrie(prostokat) {
    this.geometria = prostokat
    if (this.idAktywnego) this.pokaz(this.idAktywnego)
  }

  // Widoki kont sa natywna warstwa NAD rendererem, wiec kazde okno dialogowe
  // renderera zniknieloby pod nimi. Na czas dialogu cala warstwa schodzi.
  ustawWidocznosc(czyWidoczne) {
    this.widocznosc = Boolean(czyWidoczne)
    for (const widok of this.widoki.values()) widok.setVisible(this.widocznosc)
  }

  aktywny() {
    return this.idAktywnego ? this.widoki.get(this.idAktywnego) ?? null : null
  }

  wszystkie() {
    return this.widoki
  }

  sumaNieprzeczytanych() {
    let suma = 0
    for (const widok of this.widoki.values()) {
      if (widok.webContents.isDestroyed()) continue
      suma += licznikZTytulu(widok.webContents.getTitle())
    }
    return suma
  }
}
