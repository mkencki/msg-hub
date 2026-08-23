import { readFile, writeFile, rename, copyFile, stat, readdir, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'
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

export const LIMIT_ZALACZNIKA_BAJTY = 100 * 1024 * 1024

export async function dodajZalacznik(katalogAtt, sciezkaZrodlowa) {
  const informacje = await stat(sciezkaZrodlowa)
  if (informacje.size > LIMIT_ZALACZNIKA_BAJTY) {
    const mb = (informacje.size / 1048576).toFixed(1)
    const limitMb = (LIMIT_ZALACZNIKA_BAJTY / 1048576).toFixed(0)
    throw new Error(`plik ${mb} MB przekracza limit ${limitMb} MB`)
  }
  await mkdir(katalogAtt, { recursive: true })
  const nazwa = `${randomUUID()}-${path.basename(sciezkaZrodlowa)}`
  await copyFile(sciezkaZrodlowa, path.join(katalogAtt, nazwa))
  return `att/${nazwa}`
}

export async function usunOsierociZalaczniki(katalogAtt, makra) {
  const uzywane = new Set(makra.flatMap((m) => m.zalaczniki ?? []).map((s) => path.basename(s)))
  const usuniete = []
  for (const nazwa of await readdir(katalogAtt)) {
    if (!uzywane.has(nazwa)) {
      await unlink(path.join(katalogAtt, nazwa))
      usuniete.push(nazwa)
    }
  }
  return usuniete
}

export async function zajetoscMagazynu(katalogAtt) {
  let suma = 0
  for (const nazwa of await readdir(katalogAtt)) {
    suma += (await stat(path.join(katalogAtt, nazwa))).size
  }
  return suma
}
