import { readFile, writeFile, rename } from 'node:fs/promises'

export const UKLAD_DOMYSLNY = { szerokosc: 1280, wysokosc: 800, zmaksymalizowane: false }

const MIN_SZEROKOSC = 800
const MIN_WYSOKOSC = 600

export async function wczytajUklad(sciezkaPliku) {
  try {
    const dane = JSON.parse(await readFile(sciezkaPliku, 'utf8'))
    return {
      ...dane,
      szerokosc: Math.max(MIN_SZEROKOSC, Number(dane.szerokosc) || UKLAD_DOMYSLNY.szerokosc),
      wysokosc: Math.max(MIN_WYSOKOSC, Number(dane.wysokosc) || UKLAD_DOMYSLNY.wysokosc),
      zmaksymalizowane: Boolean(dane.zmaksymalizowane),
    }
  } catch {
    return { ...UKLAD_DOMYSLNY }
  }
}

export async function zapiszUklad(sciezkaPliku, uklad) {
  await writeFile(sciezkaPliku + '.tmp', JSON.stringify(uklad, null, 2), 'utf8')
  await rename(sciezkaPliku + '.tmp', sciezkaPliku)
}

export function ustawAutostart(wlaczony, aplikacja) {
  aplikacja.setLoginItemSettings({ openAtLogin: Boolean(wlaczony), openAsHidden: true })
}
