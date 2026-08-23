import { ipcMain, clipboard } from 'electron'
import path from 'node:path'
import { wczytajKonta, zapiszKonta, waliduj, utworzIdKonta, PLATFORMY } from './konta.js'
import { wczytajMakra, zapiszMakra, szukaj, utworzIdMakra } from './makra.js'
import { wstawTekst } from './wstawianie.js'

export function zarejestrujKanalyKont({
  katalogDanych,
  zarzadca,
  poDodaniuKonta,
  przygotujWidok = () => {},
}) {
  const plikKont = path.join(katalogDanych, 'accounts.json')

  ipcMain.handle('konta:lista', async () => (await wczytajKonta(plikKont)).konta)

  ipcMain.handle('konta:dodaj', async (_zdarzenie, dane) => {
    const { konta } = await wczytajKonta(plikKont)
    const platforma = PLATFORMY[dane.platforma]
    const konto = {
      id: utworzIdKonta(dane.nazwa, konta.map((k) => k.id)),
      nazwa: String(dane.nazwa || '').trim(),
      platforma: dane.platforma,
      url: dane.url || platforma?.url || '',
      kolor: dane.kolor || '#2f7d5b',
    }
    const bledy = waliduj(konto)
    if (bledy.length) return { ok: false, bledy }
    await zapiszKonta(plikKont, [...konta, konto])
    // Konto dodane w trakcie dzialania dostaje te sama obsluge co konta ze startu:
    // zgode na powiadomienia i sledzenie licznika nieprzeczytanych.
    przygotujWidok(zarzadca.dodaj(konto))
    poDodaniuKonta()
    return { ok: true }
  })

  ipcMain.handle('konta:przelacz', async (_zdarzenie, idKonta) => {
    zarzadca.pokaz(idKonta)
  })
}

export function zarejestrujKanalyMakr({ katalogDanych, zarzadca }) {
  const plikMakr = path.join(katalogDanych, 'macros.json')

  ipcMain.handle('makra:lista', async (_zdarzenie, fraza) => {
    const { makra } = await wczytajMakra(plikMakr)
    return szukaj(makra, fraza)
  })

  ipcMain.handle('makra:zapisz', async (_zdarzenie, makro) => {
    if (!String(makro?.nazwa || '').trim()) return { ok: false, bledy: ['nazwa jest wymagana'] }
    const { makra } = await wczytajMakra(plikMakr)
    const id = makro.id || utworzIdMakra(makro.nazwa)
    const pozostale = makra.filter((m) => m.id !== id)
    await zapiszMakra(plikMakr, [...pozostale, { zalaczniki: [], tagi: [], ...makro, id }])
    return { ok: true, id }
  })

  ipcMain.handle('makra:wstaw', async (_zdarzenie, idMakra) => {
    const { makra } = await wczytajMakra(plikMakr)
    const makro = makra.find((m) => m.id === idMakra)
    const widok = zarzadca.aktywny()
    if (!makro || !widok) return { ok: false, brakujace: [] }
    if (makro.tekst) wstawTekst(widok.webContents, makro.tekst, clipboard)
    return { ok: true, brakujace: [] }
  })
}
