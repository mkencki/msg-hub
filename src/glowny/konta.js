import { readFile, writeFile, rename } from 'node:fs/promises'

export const WERSJA_SCHEMATU = 1

export const PLATFORMY = {
  whatsapp: { url: 'https://web.whatsapp.com/', nazwaDomyslna: 'WhatsApp' },
  messenger: { url: 'https://www.messenger.com/', nazwaDomyslna: 'Messenger' },
}

export function utworzIdKonta(nazwa, istniejaceId = []) {
  const rdzen = String(nazwa)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  const podstawa = `acc-${rdzen || 'konto'}`
  if (!istniejaceId.includes(podstawa)) return podstawa
  let numer = 2
  while (istniejaceId.includes(`${podstawa}-${numer}`)) numer += 1
  return `${podstawa}-${numer}`
}

export function waliduj(konto) {
  const bledy = []
  if (!konto || typeof konto !== 'object') return ['konto musi byc obiektem']
  if (!konto.id || !/^acc-[a-z0-9-]+$/.test(konto.id)) bledy.push('id musi pasowac do acc-[a-z0-9-]+')
  if (!konto.nazwa || !String(konto.nazwa).trim()) bledy.push('nazwa jest wymagana')
  if (!PLATFORMY[konto.platforma]) bledy.push(`nieznana platforma: ${konto.platforma}`)
  if (!String(konto.url || '').startsWith('https://')) bledy.push('adres musi zaczynac sie od https://')
  if (!/^#[0-9a-fA-F]{6}$/.test(konto.kolor || '')) bledy.push('kolor musi byc w formacie #rrggbb')
  return bledy
}

// Zmienia sie tylko to, co operator widzi: nazwa i kolor zakladki. ID zostaje
// nietkniete, bo partycja sesji nazywa sie persist:<id> — przeliczenie id z nowej
// nazwy wylogowaloby konto przy samej poprawce literowki.
export function zmienKonto(konta, id, zmiany) {
  const pozycja = konta.findIndex((k) => k.id === id)
  if (pozycja === -1) return { ok: false, bledy: ['nie ma takiego konta'] }

  const zmienione = {
    ...konta[pozycja],
    nazwa: String(zmiany?.nazwa ?? '').trim(),
    kolor: zmiany?.kolor ?? konta[pozycja].kolor,
  }
  const bledy = waliduj(zmienione)
  if (bledy.length) return { ok: false, bledy }

  const wynik = [...konta]
  wynik[pozycja] = zmienione
  return { ok: true, konta: wynik }
}

// Kolejnosc w pliku jest kolejnoscia zakladek. Krancowe przesuniecie poza liste
// nie jest bledem — przycisk po prostu nic nie robi.
export function przesun(konta, id, przesuniecie) {
  const pozycja = konta.findIndex((k) => k.id === id)
  if (pozycja === -1) return [...konta]

  const cel = pozycja + przesuniecie
  if (cel < 0 || cel >= konta.length) return [...konta]

  const wynik = [...konta]
  const [konto] = wynik.splice(pozycja, 1)
  wynik.splice(cel, 0, konto)
  return wynik
}

export async function wczytajKonta(sciezkaPliku) {
  let surowe
  try {
    surowe = await readFile(sciezkaPliku, 'utf8')
  } catch (blad) {
    if (blad.code === 'ENOENT') return { wersja: WERSJA_SCHEMATU, konta: [] }
    throw blad
  }
  try {
    const dane = JSON.parse(surowe)
    const konta = Array.isArray(dane.konta) ? dane.konta.filter((k) => waliduj(k).length === 0) : []
    return { wersja: dane.wersja ?? WERSJA_SCHEMATU, konta }
  } catch {
    await rename(sciezkaPliku, sciezkaPliku + '.uszkodzony')
    return { wersja: WERSJA_SCHEMATU, konta: [] }
  }
}

export async function zapiszKonta(sciezkaPliku, konta) {
  const widziane = new Set()
  for (const konto of konta) {
    const bledy = waliduj(konto)
    if (bledy.length) throw new Error(`niepoprawne konto ${konto?.id}: ${bledy.join(', ')}`)
    if (widziane.has(konto.id)) throw new Error(`duplikat id: ${konto.id}`)
    widziane.add(konto.id)
  }
  const tresc = JSON.stringify({ wersja: WERSJA_SCHEMATU, konta }, null, 2)
  await writeFile(sciezkaPliku + '.tmp', tresc, 'utf8')
  await rename(sciezkaPliku + '.tmp', sciezkaPliku)
}
