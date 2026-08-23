import { ipcMain } from 'electron'
import path from 'node:path'
import { wczytajKonta, zapiszKonta, waliduj, utworzIdKonta, PLATFORMY } from './konta.js'

export function zarejestrujKanalyKont({ katalogDanych, zarzadca, poDodaniuKonta }) {
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
    zarzadca.dodaj(konto)
    poDodaniuKonta()
    return { ok: true }
  })

  ipcMain.handle('konta:przelacz', async (_zdarzenie, idKonta) => {
    zarzadca.pokaz(idKonta)
  })
}
