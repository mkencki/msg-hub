import { readFile, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export const WERSJA_SCHEMATU_MAKR = 1

export function utworzIdMakra(nazwa) {
  const rdzen = String(nazwa)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `mac-${rdzen || randomUUID().slice(0, 8)}`
}

export async function wczytajMakra(sciezkaPliku) {
  try {
    const dane = JSON.parse(await readFile(sciezkaPliku, 'utf8'))
    return {
      wersja: dane.wersja ?? WERSJA_SCHEMATU_MAKR,
      makra: Array.isArray(dane.makra) ? dane.makra : [],
    }
  } catch (blad) {
    if (blad.code !== 'ENOENT') {
      await rename(sciezkaPliku, sciezkaPliku + '.uszkodzony').catch(() => {})
    }
    return { wersja: WERSJA_SCHEMATU_MAKR, makra: [] }
  }
}

export async function zapiszMakra(sciezkaPliku, makra) {
  const tresc = JSON.stringify({ wersja: WERSJA_SCHEMATU_MAKR, makra }, null, 2)
  await writeFile(sciezkaPliku + '.tmp', tresc, 'utf8')
  await rename(sciezkaPliku + '.tmp', sciezkaPliku)
}

export function szukaj(makra, fraza) {
  const igla = String(fraza || '').trim().toLowerCase()
  if (!igla) return [...makra]
  return makra.filter((m) => {
    const stog = [m.nazwa, m.tekst, ...(m.tagi ?? [])].join(' ').toLowerCase()
    return stog.includes(igla)
  })
}
