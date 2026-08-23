import { describe, test, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import {
  cytujPS,
  zbudujPolecenie,
  ustawPlikWSchowku,
  utworzSesjeSchowka,
  ZNACZNIK_GOTOWE,
} from '../src/glowny/schowek-pliku.js'

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

describe('utworzSesjeSchowka', () => {
  function atrapaProcesu() {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    stdout.setEncoding('utf8')
    const wyslane = []
    stdin.on('data', (kawalek) => {
      const tekst = String(kawalek)
      wyslane.push(tekst)
      if (tekst.includes('AWARIA')) stdout.write(`BLAD sciezka nie istnieje\n${ZNACZNIK_GOTOWE}\n`)
      else stdout.write(`${ZNACZNIK_GOTOWE}\n`)
    })
    return { stdin, stdout, stderr: new PassThrough(), exitCode: null, killed: false, on() {}, wyslane }
  }

  test('wysyla Set-Clipboard z zacytowana sciezka', async () => {
    const atrapa = atrapaProcesu()
    const sesja = utworzSesjeSchowka(() => atrapa)

    await sesja.ustawPlik('C:\pliki\podrecznik [PL].pdf')

    expect(atrapa.wyslane.join('')).toContain("Set-Clipboard -LiteralPath 'C:\pliki\podrecznik [PL].pdf'")
  })

  test('drugie wstawienie uzywa tego samego procesu', async () => {
    const atrapa = atrapaProcesu()
    let starty = 0
    const sesja = utworzSesjeSchowka(() => {
      starty += 1
      return atrapa
    })

    await sesja.ustawPlik('C:\a.pdf')
    await sesja.ustawPlik('C:\b.pdf')

    expect(starty).toBe(1)
  })

  test('blad PowerShella konczy sie odrzuceniem, nie cisza', async () => {
    const sesja = utworzSesjeSchowka(() => atrapaProcesu())
    await expect(sesja.ustawPlik('C:\AWARIA.pdf')).rejects.toThrow(/sciezka nie istnieje/)
  })

  test('pusta sciezka nie startuje procesu', async () => {
    let starty = 0
    const sesja = utworzSesjeSchowka(() => {
      starty += 1
      return atrapaProcesu()
    })

    await sesja.ustawPlik('')

    expect(starty).toBe(0)
  })
})
