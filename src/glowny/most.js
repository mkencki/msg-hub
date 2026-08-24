import { ipcMain, clipboard, dialog, session } from 'electron'
import path from 'node:path'
import { access } from 'node:fs/promises'
import {
  wczytajKonta,
  zapiszKonta,
  waliduj,
  utworzIdKonta,
  zmienKonto,
  przesun,
  PLATFORMY,
} from './konta.js'
import {
  wczytajMakra,
  zapiszMakra,
  szukaj,
  utworzIdMakra,
  dodajZalacznik,
  wstawLubZastap,
  usunOsierociZalaczniki,
} from './makra.js'
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

  ipcMain.handle('konta:usun', async (_zdarzenie, idKonta) => {
    const { konta } = await wczytajKonta(plikKont)
    const pozostale = konta.filter((k) => k.id !== idKonta)
    if (pozostale.length === konta.length) return { ok: false, bledy: ['nie ma takiego konta'] }

    await zapiszKonta(plikKont, pozostale)
    zarzadca.usun(idKonta)

    // Bez wyczyszczenia partycji zalogowanie zostaje na dysku i wrocilo by,
    // gdyby konto o tym samym id powstalo ponownie.
    await session.fromPartition(`persist:${idKonta}`).clearStorageData()

    poDodaniuKonta()
    return { ok: true }
  })

  ipcMain.handle('konta:zmien', async (_zdarzenie, idKonta, zmiany) => {
    const { konta } = await wczytajKonta(plikKont)
    const wynik = zmienKonto(konta, idKonta, zmiany)
    if (!wynik.ok) return wynik

    // Widoku ani partycji nie ruszamy: id zostaje to samo, wiec zalogowanie zyje dalej.
    await zapiszKonta(plikKont, wynik.konta)
    return { ok: true }
  })

  ipcMain.handle('konta:przesun', async (_zdarzenie, idKonta, przesuniecie) => {
    const { konta } = await wczytajKonta(plikKont)
    // Kolejnosc w pliku jest kolejnoscia zakladek — pasek odbuduje sie z niej.
    await zapiszKonta(plikKont, przesun(konta, idKonta, przesuniecie))
    return { ok: true }
  })

  ipcMain.handle('okna:widocznosc-kont', (_zdarzenie, czyWidoczne) => {
    zarzadca.ustawWidocznosc(czyWidoczne)
  })

  ipcMain.handle('konta:przelacz', async (_zdarzenie, idKonta) => {
    zarzadca.pokaz(idKonta)
  })
}

export function zarejestrujKanalyMakr({ katalogDanych, zarzadca, sesjaSchowka }) {
  const plikMakr = path.join(katalogDanych, 'macros.json')
  const katalogAtt = path.join(katalogDanych, 'att')

  ipcMain.handle('makra:lista', async (_zdarzenie, fraza) => {
    const { makra } = await wczytajMakra(plikMakr)
    return szukaj(makra, fraza)
  })

  ipcMain.handle('makra:zapisz', async (_zdarzenie, makro) => {
    if (!String(makro?.nazwa || '').trim()) return { ok: false, bledy: ['nazwa jest wymagana'] }
    const { makra } = await wczytajMakra(plikMakr)
    const id = makro.id || utworzIdMakra(makro.nazwa)
    const zapisane = wstawLubZastap(makra, { zalaczniki: [], tagi: [], ...makro, id })
    await zapiszMakra(plikMakr, zapisane)
    // Zalacznik zdjety w edytorze przestaje byc uzywany — bez sprzatania
    // zostalby w magazynie na zawsze, a to nierzadko kilka MB wideo.
    await usunOsierociZalaczniki(katalogAtt, zapisane)
    return { ok: true, id }
  })

  ipcMain.handle('makra:usun', async (_zdarzenie, idMakra) => {
    const { makra } = await wczytajMakra(plikMakr)
    const pozostale = makra.filter((m) => m.id !== idMakra)
    if (pozostale.length === makra.length) return { ok: false, bledy: ['nie ma takiego makra'] }
    await zapiszMakra(plikMakr, pozostale)
    await usunOsierociZalaczniki(katalogAtt, pozostale)
    return { ok: true }
  })

  ipcMain.handle('makra:wstaw', async (_zdarzenie, idMakra) => {
    const { makra } = await wczytajMakra(plikMakr)
    const makro = makra.find((m) => m.id === idMakra)

    // Kazde niepowodzenie ma nazwany powod. Bez tego panel po prostu znikal
    // i operator nie wiedzial, czy makro poszlo, czy nie — a nie poszlo.
    if (!makro) return { ok: false, powod: 'brak-makra', brakujace: [] }

    const widok = zarzadca.aktywny()
    if (!widok) return { ok: false, powod: 'brak-konta', brakujace: [] }

    const zalaczniki = makro.zalaczniki ?? []
    if (!makro.tekst && !zalaczniki.length) {
      return { ok: false, powod: 'puste-makro', brakujace: [] }
    }

    if (makro.tekst) wstawTekst(widok.webContents, makro.tekst, clipboard)

    // Spec sekcja 8: brak pliku w magazynie nie moze wywrocic makra —
    // tekst ma zadzialac, a interfejs ma pokazac, ktorych zalacznikow brakuje.
    const brakujace = []
    for (const wzgledna of zalaczniki) {
      const pelna = path.join(katalogDanych, wzgledna)
      try {
        await access(pelna)
      } catch {
        brakujace.push(wzgledna)
        continue
      }
      await sesjaSchowka.ustawPlik(pelna)
      widok.webContents.paste()
    }
    return {
      ok: brakujace.length === 0,
      powod: brakujace.length ? 'brak-plikow' : null,
      brakujace,
    }
  })

  ipcMain.handle('pliki:wybierz', async () => {
    const wynik = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (wynik.canceled || !wynik.filePaths.length) return null
    try {
      return await dodajZalacznik(katalogAtt, wynik.filePaths[0])
    } catch (blad) {
      return { blad: blad.message }
    }
  })
}
