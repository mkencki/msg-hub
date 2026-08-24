import { naHtml } from './podglad.js'
import { t, dostepneJezyki, poprawnyJezyk, JEZYK_DOMYSLNY } from './i18n.js'

// Jezyk interfejsu. Wartosc przychodzi z procesu glownego przy starcie, wiec do
// czasu odpowiedzi trzymamy domyslny — inaczej pierwsza klatka pokazalaby gole klucze.
let jezykUI = JEZYK_DOMYSLNY
const tr = (klucz, parametry) => t(jezykUI, klucz, parametry)

// Teksty statyczne siedza w HTML pod data-i18n i sa podmieniane na miejscu.
// Dzieki temu zmiana jezyka nie wymaga przeladowania okna — a przeladowanie
// zerwaloby natywne widoki kont razem z zalogowaniem.
function przetlumaczDokument() {
  document.documentElement.lang = jezykUI
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = tr(element.dataset.i18n)
  }
  for (const element of document.querySelectorAll('[data-i18n-title]')) {
    element.title = tr(element.dataset.i18nTitle)
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.placeholder = tr(element.dataset.i18nPlaceholder)
  }
  for (const element of document.querySelectorAll('[data-i18n-aria]')) {
    element.setAttribute('aria-label', tr(element.dataset.i18nAria))
  }
}

const szyna = document.getElementById('szyna')
const kanaly = document.getElementById('kanaly')
const wyborJezyka = document.getElementById('wybor-jezyka')
const oknoKonta = document.getElementById('okno-konta')
const bledyKonta = document.getElementById('bledy-konta')
const oknoMakr = document.getElementById('okno-makr')
const szukajka = document.getElementById('szukaj-makro')
const listaMakr = document.getElementById('lista-makr')

let aktywneKontoId = null
let kontaWSzynie = []
let licznikiKont = {}

function opisLicznika(ile) {
  return ile ? tr('nieprzeczytane', { n: ile }) : tr('brakNowych')
}

// Kolor aktywnego konta obrysowuje cala studnie robocza — to jedyny nasycony
// element okna i jedyna stala odpowiedz na pytanie "kim teraz jestem".
function pomalujKanal(konto) {
  document.documentElement.style.setProperty('--kanal', konto?.kolor ?? '#2f7d5b')

  for (const [chip, nazwa] of [
    [document.getElementById('listwa-chip'), document.getElementById('listwa-nazwa')],
    [document.getElementById('cel-chip'), document.getElementById('cel-nazwa')],
  ]) {
    chip.style.setProperty('--barwa', konto?.kolor ?? 'transparent')
    nazwa.textContent = konto?.nazwa ?? tr('brakKont')
  }

  const suma = Object.values(licznikiKont).reduce((razem, ile) => razem + ile, 0)
  document.getElementById('listwa-licznik').textContent = suma
    ? tr('nieprzeczytaneSuma', { n: suma })
    : tr('wszystkoPrzeczytane')
}

async function przelaczNa(idKonta) {
  aktywneKontoId = idKonta
  await window.mostHub.przelacz(idKonta)
  for (const kanal of kanaly.children) {
    kanal.setAttribute('aria-selected', String(kanal.dataset.idKonta === idKonta))
  }
  pomalujKanal(kontaWSzynie.find((k) => k.id === idKonta))
}

function odswiezLiczniki() {
  for (const kanal of kanaly.children) {
    const ile = licznikiKont[kanal.dataset.idKonta] ?? 0
    const dane = kanal.querySelector('.kanal-dane')
    dane.textContent = opisLicznika(ile)
    dane.classList.toggle('sa-nowe', ile > 0)
    // W zwinieciu nazwy nie ma, wiec nieprzeczytane musi niesc sam kolor kanalu.
    kanal.classList.toggle('ma-nowe', ile > 0)
  }
  pomalujKanal(kontaWSzynie.find((k) => k.id === aktywneKontoId))
}

// Szyna zwija sie do samych kolorow kanalow i rozwija na najazd kursora — az do
// przypiecia, ktore trzyma ja rozwinieta na stale. Stan liczy proces glowny, bo
// to on ustawia geometrie widokow; renderer tylko zglasza najazd i maluje wynik.
let szynaPrzypieta = false

function zastosujStanSzyny({ przypieta, rozwinieta }) {
  szynaPrzypieta = Boolean(przypieta)
  document.documentElement.style.setProperty('--szyna', rozwinieta ? '162px' : '48px')
  szyna.classList.toggle('rozwinieta', Boolean(rozwinieta))
  szyna.classList.toggle('przypieta', szynaPrzypieta)
  const przycisk = document.getElementById('przypnij-szyne')
  przycisk.title = tr(szynaPrzypieta ? 'odepnijSzyne' : 'przypnijSzyne')
  przycisk.setAttribute('aria-pressed', String(szynaPrzypieta))
}

szyna.addEventListener('mouseenter', () => window.mostHub.najazdSzyny(true))
szyna.addEventListener('mouseleave', () => window.mostHub.najazdSzyny(false))

document.getElementById('przypnij-szyne').addEventListener('click', () => {
  window.mostHub.przypnijSzyne(!szynaPrzypieta)
})

window.mostHub.naZmianeSzyny(zastosujStanSzyny)

async function odswiezSzyne() {
  kontaWSzynie = await window.mostHub.listaKont()

  // Szyna odbudowuje sie po kazdej zmianie nazwy i kolejnosci. Bez zapamietanego
  // konta operator ladowalby wtedy za kazdym razem na pierwszym kanale.
  const wybrane = kontaWSzynie.some((k) => k.id === aktywneKontoId)
    ? aktywneKontoId
    : kontaWSzynie[0]?.id ?? null

  kanaly.replaceChildren()
  for (const konto of kontaWSzynie) {
    const kanal = document.createElement('button')
    kanal.className = 'kanal'
    kanal.dataset.idKonta = konto.id
    kanal.style.setProperty('--barwa', konto.kolor)
    kanal.setAttribute('aria-selected', String(konto.id === wybrane))
    kanal.title = `${konto.nazwa} (${konto.platforma})`

    const chip = document.createElement('i')
    chip.className = 'chip'

    const nazwa = document.createElement('span')
    nazwa.className = 'kanal-nazwa'
    nazwa.textContent = konto.nazwa

    // Druga linia odpowiada na jedyne pytanie, ktore zmienia sie co chwile:
    // czy ten kanal mnie potrzebuje. Platforma jest juz w nazwie i w ustawieniach.
    const dane = document.createElement('span')
    dane.className = 'kanal-dane'
    dane.textContent = opisLicznika(licznikiKont[konto.id] ?? 0)
    dane.classList.toggle('sa-nowe', (licznikiKont[konto.id] ?? 0) > 0)

    kanal.append(chip, nazwa, dane)
    kanal.addEventListener('click', () => przelaczNa(konto.id))
    kanaly.append(kanal)
  }

  if (wybrane) await przelaczNa(wybrane)
  else pomalujKanal(null)
}

let edytowaneKontoId = null

async function otworzFormularzKonta(konto = null) {
  edytowaneKontoId = konto?.id ?? null
  bledyKonta.textContent = ''

  const formularz = oknoKonta.querySelector('form')
  formularz.reset()
  document.getElementById('tytul-konta').textContent = tr(konto ? 'edycjaKonta' : 'dodajKonto')

  // Platforma wyznacza adres i partycje sesji — jej podmiana bylaby innym kontem,
  // nie poprawka tego samego, wiec przy edycji pole jest zablokowane.
  const platforma = formularz.querySelector('select[name="platforma"]')
  platforma.disabled = Boolean(konto)

  if (konto) {
    formularz.querySelector('input[name="nazwa"]').value = konto.nazwa
    platforma.value = konto.platforma
    formularz.querySelector('input[name="kolor"]').value = konto.kolor
  } else {
    // Dwa konta w tym samym kolorze znosza sygnal tozsamosci — podpowiadamy wolny.
    formularz.querySelector('input[name="kolor"]').value = await window.mostHub.wolnyKolor()
  }

  pokazDialog(oknoKonta)
}

document.getElementById('dodaj-konto').addEventListener('click', () => otworzFormularzKonta())

oknoKonta.addEventListener('close', () => {
  edytowaneKontoId = null
})

document.getElementById('zapisz-konto').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  const dane = Object.fromEntries(new FormData(oknoKonta.querySelector('form')))

  const wynik = edytowaneKontoId
    ? await window.mostHub.zmienKonto(edytowaneKontoId, { nazwa: dane.nazwa, kolor: dane.kolor })
    : await window.mostHub.dodajKonto(dane)

  if (!wynik.ok) {
    bledyKonta.textContent = opiszBledy(wynik.bledy)
    return
  }

  edytowaneKontoId = null
  oknoKonta.close()
  await odswiezSzyne()
  if (oknoUstawien.open) await odswiezListeKont()
})

// Panel zamyka sie przy kazdym wyborze, wiec brak wstawienia jest niewidoczny —
// kazdy powod musi trafic na listwe, inaczej wyglada to jak udane wstawienie.
const POWODY_WSTAWIANIA = {
  'brak-konta': 'komunikatBrakKonta',
  'brak-makra': 'komunikatBrakMakra',
  'puste-makro': 'komunikatPusteMakro',
}

// Proces glowny oddaje bledy jako kody z parametrami — dopiero tutaj wiadomo,
// w ktorym jezyku ma je zobaczyc uzytkownik.
function opiszBledy(bledy) {
  return (bledy ?? []).map((blad) => tr(blad.kod, blad.parametry)).join('; ')
}

let zaznaczoneMakro = 0

async function wstawMakro(makro) {
  schowajKomunikat()
  oknoMakr.close()
  const wynik = await window.mostHub.wstawMakro(makro.id)

  if (wynik?.ok) {
    // Obietnica produktu wypowiedziana wprost: aplikacja przygotowuje, nie wysyla.
    const konto = kontaWSzynie.find((k) => k.id === aktywneKontoId)
    pokazKomunikat(
      tr('komunikatWstawiono', { makro: makro.nazwa, konto: konto?.nazwa ?? tr('komunikatKonta') }),
      'info',
    )
    return
  }
  if (!wynik) return

  if (wynik.brakujace?.length) {
    pokazKomunikat(tr('komunikatBrakujaZalaczniki', { lista: wynik.brakujace.join(', ') }))
    return
  }
  pokazKomunikat(tr(POWODY_WSTAWIANIA[wynik.powod] ?? 'komunikatWstawianieNieudane'))
}

export async function odswiezMakra() {
  const makra = await window.mostHub.listaMakr(szukajka.value)
  listaMakr.replaceChildren()

  if (!makra.length) {
    const puste = document.createElement('li')
    puste.className = 'puste'
    puste.textContent = szukajka.value
      ? tr('nicNiePasuje', { fraza: szukajka.value })
      : tr('brakMakr')
    listaMakr.append(puste)
    return
  }

  if (zaznaczoneMakro >= makra.length) zaznaczoneMakro = 0

  makra.forEach((makro, indeks) => {
    const pozycja = document.createElement('li')
    const liczba = (makro.zalaczniki ?? []).length
    pozycja.dataset.idMakra = makro.id
    pozycja.setAttribute('aria-selected', String(indeks === zaznaczoneMakro))

    const etykieta = document.createElement('span')
    etykieta.className = 'etykieta-makra'
    etykieta.textContent = liczba ? tr('etykietaMakra', { nazwa: makro.nazwa, liczba }) : makro.nazwa

    // Klikniecie wiersza wstawia makro — to najczestsza czynnosc, wiec zostaje
    // najtansza. Przyciski zatrzymuja propagacje, zeby edycja i usuwanie nie
    // wstawialy makra przy okazji.
    pozycja.addEventListener('click', () => wstawMakro(makro))

    const edytuj = document.createElement('button')
    edytuj.type = 'button'
    edytuj.className = 'edytuj-makro'
    edytuj.textContent = tr('edytuj')
    edytuj.title = tr('edytujMakro', { nazwa: makro.nazwa })
    edytuj.addEventListener('click', (zdarzenie) => {
      zdarzenie.stopPropagation()
      otworzEdytor(makro)
    })

    const usun = document.createElement('button')
    usun.type = 'button'
    usun.className = 'usun-makro grozny'
    usun.textContent = tr('usun')
    usun.title = tr('usunMakroTytul', { nazwa: makro.nazwa })
    usun.addEventListener('click', (zdarzenie) => {
      zdarzenie.stopPropagation()
      zapytajOUsuniecieMakra(makro)
    })

    pozycja.append(etykieta, edytuj, usun)
    listaMakr.append(pozycja)
  })
}

szukajka.addEventListener('input', () => {
  zaznaczoneMakro = 0
  odswiezMakra()
})

// Wybor makra idzie strzalkami i Enterem: przy kilkudziesieciu pozycjach
// siegniecie po mysz kosztuje wiecej niz samo wstawienie.
szukajka.addEventListener('keydown', async (zdarzenie) => {
  const wiersze = [...listaMakr.querySelectorAll('li[data-id-makra]')]
  if (!wiersze.length) return

  if (zdarzenie.key === 'ArrowDown' || zdarzenie.key === 'ArrowUp') {
    zdarzenie.preventDefault()
    const krok = zdarzenie.key === 'ArrowDown' ? 1 : -1
    zaznaczoneMakro = (zaznaczoneMakro + krok + wiersze.length) % wiersze.length
    await odswiezMakra()
    listaMakr.querySelector('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    return
  }

  if (zdarzenie.key === 'Enter') {
    zdarzenie.preventDefault()
    const idMakra = wiersze[zaznaczoneMakro]?.dataset.idMakra
    const makra = await window.mostHub.listaMakr(szukajka.value)
    const makro = makra.find((m) => m.id === idMakra)
    if (makro) await wstawMakro(makro)
  }
})

document.getElementById('otworz-makra').addEventListener('click', async () => {
  szukajka.value = ''
  zaznaczoneMakro = 0
  await odswiezMakra()
  pokazDialog(oknoMakr)
  szukajka.focus()
})

// Panel makr nie ma <form method="dialog">, wiec samo value="zamknij" niczego
// nie zamyka — przycisk potrzebuje jawnej obslugi, tak jak w ustawieniach.
document.getElementById('zamknij-makra').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  oknoMakr.close()
})

window.addEventListener('keydown', (zdarzenie) => {
  if (zdarzenie.ctrlKey && zdarzenie.key === ';') {
    zdarzenie.preventDefault()
    document.getElementById('otworz-makra').click()
  }
})

// Ten sam skrot wcisniety, gdy fokus trzyma widok konta, w ogole nie dociera
// do renderera — przechwytuje go wtedy proces glowny i przysyla gotowa decyzje.
window.mostHub.naOtwarcieMakr(() => document.getElementById('otworz-makra').click())

// Spec sekcja 8: nieudany start ma dac jawny komunikat, nie pusta listwe.
// Komunikat MUSI dac sie zdjac — inaczej nieaktualny blad okupuje listwe do konca
// sesji i operator czyta go jeszcze dlugo po naprawieniu przyczyny.
function pokazKomunikat(tekst, ton = 'blad') {
  const pasek = document.getElementById('komunikat')
  document.getElementById('tresc-komunikatu').textContent = tekst
  pasek.dataset.ton = ton
  pasek.hidden = false
}

function schowajKomunikat() {
  document.getElementById('tresc-komunikatu').textContent = ''
  document.getElementById('komunikat').hidden = true
}

document.getElementById('zamknij-komunikat').addEventListener('click', schowajKomunikat)

// Blad zgloszony przez OTWARTE okno dialogowe nie moze isc na listwe: modal
// unieruchamia wszystko poza soba, wiec komunikat bylby widoczny, ale martwy —
// nie do zamkniecia i oderwany od pola, ktorego dotyczy. Formularz konta ma
// wlasne #bledy-konta od poczatku; edytor makra dostaje swoje.
function pokazBladMakra(tekst) {
  document.getElementById('bledy-makra').textContent = tekst
}

function zbudujWyborJezyka() {
  wyborJezyka.replaceChildren()
  for (const { kod, nazwa } of dostepneJezyki()) {
    const opcja = document.createElement('option')
    opcja.value = kod
    // Jezyk podpisuje sie wlasna nazwa: kto szuka polskiego, szuka slowa "Polski",
    // a nie jego tlumaczenia na jezyk, ktorego wlasnie nie rozumie.
    opcja.textContent = nazwa
    wyborJezyka.append(opcja)
  }
  wyborJezyka.value = jezykUI
}

// Zmiana jezyka NIE przeladowuje okna — przeladowanie zerwaloby natywne widoki
// kont razem z zalogowaniem. Przemalowujemy wiec wszystko, co samo sklada teksty.
async function zastosujJezyk() {
  przetlumaczDokument()
  zbudujWyborJezyka()
  zastosujStanSzyny({ przypieta: szynaPrzypieta, rozwinieta: szyna.classList.contains('rozwinieta') })
  await odswiezSzyne()
  if (oknoUstawien.open) await odswiezListeKont()
  if (oknoMakr.open) await odswiezMakra()
}

wyborJezyka.addEventListener('change', async () => {
  jezykUI = poprawnyJezyk(await window.mostHub.ustawJezyk(wyborJezyka.value))
  await zastosujJezyk()
})

async function start() {
  try {
    // Jezyk musi byc znany PRZED pierwszym rysowaniem list, inaczej pierwsza
    // klatka pokazuje angielski, a druga podmienia go na polski.
    jezykUI = poprawnyJezyk(await window.mostHub.odczytajJezyk())
    przetlumaczDokument()
    zbudujWyborJezyka()
    zastosujStanSzyny(await window.mostHub.stanSzyny())
    await odswiezSzyne()
  } catch (blad) {
    pokazKomunikat(tr('komunikatWczytanieKont', { blad: blad.message }))
  } finally {
    // Sygnal gotowosci zapada dopiero TERAZ: przedtem teksty byly jeszcze
    // angielskie z HTML-a, wiec test polskiego interfejsu lapalby stara klatke.
    document.body.dataset.gotowy = '1'
  }
}

start()

// Nakladka licznika na ikonie paska zadan. Electron przyjmuje tylko gotowy obrazek,
// wiec 16x16 rysuje renderer i odsyla jako data URL. Zero = brak nakladki.
export function narysujLicznik(suma) {
  if (!suma) return null
  const napis = suma > 99 ? '99+' : String(suma)
  const plotno = document.createElement('canvas')
  plotno.width = 16
  plotno.height = 16
  const pedzel = plotno.getContext('2d')
  pedzel.fillStyle = '#f15c6d'
  pedzel.beginPath()
  pedzel.arc(8, 8, 8, 0, Math.PI * 2)
  pedzel.fill()
  pedzel.fillStyle = '#ffffff'
  pedzel.font = `bold ${napis.length > 2 ? 8 : 11}px "Segoe UI", sans-serif`
  pedzel.textAlign = 'center'
  pedzel.textBaseline = 'middle'
  pedzel.fillText(napis, 8, 9)
  return plotno.toDataURL('image/png')
}

// Proces glowny przysyla sume i rozbicie na konta — szyna pokazuje licznik
// przy kazdym kanale, a nakladka na ikonie nadal potrzebuje samej sumy.
window.mostHub.naLicznik((dane) => {
  const suma = typeof dane === 'number' ? dane : (dane?.suma ?? 0)
  licznikiKont = typeof dane === 'number' ? {} : (dane?.wgKont ?? {})
  odswiezLiczniki()
  window.mostHub.ustawNakladke(narysujLicznik(suma))
})

// Komunikaty z procesu glownego (np. nieudane ladowanie konta) ladują na listwie,
// nie w modalnym okienku — jedno chore konto nie blokuje pozostalych.
window.mostHub.naKomunikat((tekst) => pokazKomunikat(tekst))

const oknoEdytora = document.getElementById('okno-edytora')
const edytorNazwa = document.getElementById('edytor-nazwa')
const edytorTekst = document.getElementById('edytor-tekst')
const edytorPodglad = document.getElementById('edytor-podglad')

function odswiezPodglad() {
  edytorPodglad.innerHTML = naHtml(edytorTekst.value)
}

edytorTekst.addEventListener('input', odswiezPodglad)

document.getElementById('pasek-formatowania').addEventListener('click', (zdarzenie) => {
  const przycisk = zdarzenie.target.closest('button')
  if (!przycisk) return
  const poczatek = edytorTekst.selectionStart
  const koniec = edytorTekst.selectionEnd
  const tresc = edytorTekst.value

  if (przycisk.dataset.znacznik) {
    const znak = przycisk.dataset.znacznik
    const zaznaczone = tresc.slice(poczatek, koniec) || 'tekst'
    edytorTekst.value = tresc.slice(0, poczatek) + znak + zaznaczone + znak + tresc.slice(koniec)
  } else if (przycisk.dataset.prefiks) {
    const prefiks = przycisk.dataset.prefiks
    const poczatekLinii = tresc.lastIndexOf('\n', poczatek - 1) + 1
    edytorTekst.value = tresc.slice(0, poczatekLinii) + prefiks + tresc.slice(poczatekLinii)
  }
  edytorTekst.focus()
  odswiezPodglad()
})

// Edycja zachowuje id makra, nawet gdy zmieni sie nazwa — inaczej poprawka
// nazwy tworzylaby drugie makro obok starego.
let edytowaneMakroId = null

function otworzEdytor(makro = null) {
  edytowaneMakroId = makro?.id ?? null
  pokazBladMakra('')
  document.getElementById('tytul-edytora').textContent = tr(makro ? 'edycjaMakra' : 'noweMakro')
  edytorNazwa.value = makro?.nazwa ?? ''
  edytorTekst.value = makro?.tekst ?? ''
  zalacznikiMakra = [...(makro?.zalaczniki ?? [])]
  odswiezZalaczniki()
  odswiezPodglad()
  oknoMakr.close()
  pokazDialog(oknoEdytora)
}

document.getElementById('nowe-makro').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  otworzEdytor()
})

document.getElementById('anuluj-makro').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  oknoEdytora.close()
})

document.getElementById('zapisz-makro').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  pokazBladMakra('')
  const wynik = await window.mostHub.zapiszMakro({
    ...(edytowaneMakroId ? { id: edytowaneMakroId } : {}),
    nazwa: edytorNazwa.value,
    tekst: edytorTekst.value,
    zalaczniki: zalacznikiMakra,
  })
  if (!wynik.ok) {
    pokazBladMakra(opiszBledy(wynik.bledy))
    return
  }
  edytowaneMakroId = null
  oknoEdytora.close()
})

let zalacznikiMakra = []

// Nazwa w magazynie ma prefiks UUID — operatorowi pokazujemy tylko oryginalna nazwe.
function odswiezZalaczniki() {
  const pole = document.getElementById('lista-zalacznikow')
  pole.replaceChildren()

  if (!zalacznikiMakra.length) {
    const puste = document.createElement('li')
    puste.className = 'puste'
    puste.textContent = tr('brak')
    pole.append(puste)
    return
  }

  for (const wzgledna of zalacznikiMakra) {
    const pozycja = document.createElement('li')

    const nazwa = document.createElement('span')
    nazwa.className = 'nazwa-zalacznika'
    nazwa.textContent = wzgledna.replace(/^att\/[0-9a-f-]+-/, '')

    // Zdjecie tylko odpina zalacznik od makra; plik znika z magazynu dopiero
    // przy zapisie, wiec anulowanie edytora niczego nie kasuje.
    const zdejmij = document.createElement('button')
    zdejmij.type = 'button'
    zdejmij.className = 'zdejmij-zalacznik'
    zdejmij.textContent = tr('zdejmij')
    zdejmij.title = tr('zdejmijPlik', { nazwa: nazwa.textContent })
    zdejmij.addEventListener('click', () => {
      zalacznikiMakra = zalacznikiMakra.filter((s) => s !== wzgledna)
      odswiezZalaczniki()
    })

    pozycja.append(nazwa, zdejmij)
    pole.append(pozycja)
  }
}

document.getElementById('dodaj-zalacznik').addEventListener('click', async () => {
  pokazBladMakra('')
  const wynik = await window.mostHub.wybierzPlik()
  if (!wynik) return
  if (wynik.blad) {
    pokazBladMakra(`Nie mozna dodac zalacznika: ${wynik.blad}`)
    return
  }
  zalacznikiMakra.push(wynik)
  odswiezZalaczniki()
})

// Widoki kont to natywna warstwa NAD trescia okna — otwarty <dialog> chowa sie
// pod nia i tylko blokuje klikniecia. Warstwa schodzi, gdy otwarte jest JAKIEKOLWIEK
// okno dialogowe. Stan liczymy z DOM, bo zdarzenie "close" dialogu jest kolejkowane,
// nie synchroniczne: przy przejsciu panel -> edytor przyszloby PO otwarciu edytora
// i przywrocilo warstwe na wierzch.
function odswiezWidocznoscKont() {
  const ktoregokolwiek = [...document.querySelectorAll('dialog')].some((d) => d.open)
  window.mostHub.ustawWidocznoscKont(!ktoregokolwiek)
}

function pokazDialog(dialog) {
  // Powtorny showModal na otwartym dialogu rzuca wyjatek — a skrot da sie
  // wcisnac drugi raz, zanim operator zauwazy otwarty panel.
  if (dialog.open) return
  dialog.showModal()
  odswiezWidocznoscKont()
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', odswiezWidocznoscKont)
}

const oknoUstawien = document.getElementById('okno-ustawien')
const listaKont = document.getElementById('lista-kont')
const oknoUsuwania = document.getElementById('okno-usuwania')
let kontoDoUsuniecia = null

async function odswiezListeKont() {
  const konta = await window.mostHub.listaKont()
  listaKont.replaceChildren()

  if (!konta.length) {
    const puste = document.createElement('li')
    puste.className = 'puste'
    puste.textContent = tr('brakKontPodpowiedz')
    listaKont.append(puste)
    return
  }

  konta.forEach((konto, indeks) => {
    const pozycja = document.createElement('li')

    const znacznik = document.createElement('span')
    znacznik.className = 'znacznik-konta'
    znacznik.style.background = konto.kolor

    const opis = document.createElement('span')
    opis.className = 'opis-konta'
    opis.textContent = konto.nazwa

    const platforma = document.createElement('span')
    platforma.className = 'platforma-konta'
    platforma.textContent = konto.platforma

    // Kolejnosc zmieniamy przyciskami, nie przeciaganiem: nad trescia okna leza
    // natywne widoki kont i chwytanie elementu myszka bywa przez nie zjadane.
    const przesuwanie = document.createElement('span')
    przesuwanie.className = 'przesuwanie'

    const wGore = document.createElement('button')
    wGore.type = 'button'
    wGore.className = 'w-gore'
    wGore.textContent = '▲'
    wGore.title = tr('przesunWGore', { nazwa: konto.nazwa })
    wGore.disabled = indeks === 0
    wGore.addEventListener('click', () => przesunKonto(konto.id, -1))

    const wDol = document.createElement('button')
    wDol.type = 'button'
    wDol.className = 'w-dol'
    wDol.textContent = '▼'
    wDol.title = tr('przesunWDol', { nazwa: konto.nazwa })
    wDol.disabled = indeks === konta.length - 1
    wDol.addEventListener('click', () => przesunKonto(konto.id, 1))

    przesuwanie.append(wGore, wDol)

    const edytuj = document.createElement('button')
    edytuj.type = 'button'
    edytuj.className = 'edytuj-konto'
    edytuj.textContent = tr('edytuj')
    edytuj.title = tr('edytujKonto', { nazwa: konto.nazwa })
    edytuj.addEventListener('click', () => otworzFormularzKonta(konto))

    const usun = document.createElement('button')
    usun.type = 'button'
    usun.className = 'usun-konto grozny'
    usun.textContent = tr('usun')
    usun.title = tr('usunKontoTytul', { nazwa: konto.nazwa })
    usun.addEventListener('click', () => zapytajOUsuniecie(konto))

    pozycja.append(znacznik, opis, platforma, przesuwanie, edytuj, usun)
    listaKont.append(pozycja)
  })
}

async function przesunKonto(idKonta, przesuniecie) {
  await window.mostHub.przesunKonto(idKonta, przesuniecie)
  await odswiezSzyne()
  await odswiezListeKont()
}

document.getElementById('otworz-ustawienia').addEventListener('click', async () => {
  await odswiezListeKont()
  pokazDialog(oknoUstawien)
})

document.getElementById('zamknij-ustawienia').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  oknoUstawien.close()
})

document.getElementById('dodaj-konto-ustawienia').addEventListener('click', () => {
  oknoUstawien.close()
  otworzFormularzKonta()
})

// Usuniecie kasuje sesje, czyli wylogowuje — dlatego potwierdzenie, a nie samo klikniecie.
// Okno potwierdzenia otwiera sie NAD ustawieniami, wiec po zamknieciu operator wraca
// tam, skad przyszedl, z odswiezona lista.
function zapytajOUsuniecie(konto) {
  kontoDoUsuniecia = konto
  document.getElementById('tresc-usuwania').textContent = tr('kontoZniknie', { nazwa: konto.nazwa })
  pokazDialog(oknoUsuwania)
}

document.getElementById('anuluj-usuniecie').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  kontoDoUsuniecia = null
  oknoUsuwania.close()
})

document.getElementById('potwierdz-usuniecie').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  schowajKomunikat()
  if (!kontoDoUsuniecia) return
  const wynik = await window.mostHub.usunKonto(kontoDoUsuniecia.id)
  kontoDoUsuniecia = null
  oknoUsuwania.close()
  if (!wynik.ok) {
    pokazKomunikat(opiszBledy(wynik.bledy))
    return
  }
  await odswiezSzyne()
  await odswiezListeKont()
})

// Usuniecie kasuje takze zalaczniki z magazynu, wiec wymaga potwierdzenia —
// dokladnie jak przy kontach.
const oknoUsuwaniaMakra = document.getElementById('okno-usuwania-makra')
let makroDoUsuniecia = null

function zapytajOUsuniecieMakra(makro) {
  makroDoUsuniecia = makro
  const liczba = (makro.zalaczniki ?? []).length
  document.getElementById('tresc-usuwania-makra').textContent = liczba
    ? tr('usunMakroZZalacznikami', { nazwa: makro.nazwa, liczba })
    : tr('usunMakroPytanie', { nazwa: makro.nazwa })
  pokazDialog(oknoUsuwaniaMakra)
}

document.getElementById('anuluj-usuniecie-makra').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  makroDoUsuniecia = null
  oknoUsuwaniaMakra.close()
})

document.getElementById('potwierdz-usuniecie-makra').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  schowajKomunikat()
  if (!makroDoUsuniecia) return
  const wynik = await window.mostHub.usunMakro(makroDoUsuniecia.id)
  makroDoUsuniecia = null
  oknoUsuwaniaMakra.close()
  if (!wynik.ok) {
    pokazKomunikat(opiszBledy(wynik.bledy))
    return
  }
  await odswiezMakra()
})
