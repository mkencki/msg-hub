import { describe, test, expect } from 'vitest'
import { cytujPS, zbudujPolecenie, ustawPlikWSchowku } from '../src/glowny/schowek-pliku.js'

describe('cytujPS', () => {
  test('otacza apostrofami', () => {
    expect(cytujPS('C:\pliki\a.pdf')).toBe("'C:\pliki\a.pdf'")
  })

  test('podwaja apostrofy — zabezpieczenie przed wstrzyknieciem', () => {
    expect(cytujPS("C:\pliki\o'brien.pdf")).toBe("'C:\pliki\o''brien.pdf'")
  })
})

describe('zbudujPolecenie', () => {
  test('wola powershell.exe, nigdy pwsh', () => {
    const { plik } = zbudujPolecenie('C:\a.pdf')
    expect(plik).toBe('powershell.exe')
  })

  test('uzywa -LiteralPath, zeby nawiasy kwadratowe nie byly wieloznacznikami', () => {
    const { argumenty } = zbudujPolecenie('C:\podrecznik [PL].pdf')
    const polecenie = argumenty.join(' ')
    expect(polecenie).toContain('-LiteralPath')
    expect(polecenie).toContain('podrecznik [PL].pdf')
  })

  test('przekazuje -NoProfile i -STA', () => {
    const { argumenty } = zbudujPolecenie('C:\a.pdf')
    expect(argumenty).toContain('-NoProfile')
    expect(argumenty).toContain('-STA')
  })
})

describe('ustawPlikWSchowku', () => {
  test('uruchamia zbudowane polecenie', async () => {
    const wywolania = []
    await ustawPlikWSchowku('C:\a.pdf', async (plik, argumenty) => {
      wywolania.push({ plik, argumenty })
    })
    expect(wywolania).toHaveLength(1)
    expect(wywolania[0].plik).toBe('powershell.exe')
  })

  test('pusta sciezka nie uruchamia niczego', async () => {
    const wywolania = []
    await ustawPlikWSchowku('', async () => wywolania.push(1))
    expect(wywolania).toHaveLength(0)
  })
})
