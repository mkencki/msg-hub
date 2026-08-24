import { naHtml } from './podglad.js'

const zakladki = document.getElementById('zakladki')
const oknoKonta = document.getElementById('okno-konta')
const bledyKonta = document.getElementById('bledy-konta')
const oknoMakr = document.getElementById('okno-makr')
const szukajka = document.getElementById('szukaj-makro')
const listaMakr = document.getElementById('lista-makr')

let aktywneKontoId = null

async function przelaczNa(idKonta) {
  aktywneKontoId = idKonta
  await window.mostHub.przelacz(idKonta)
  for (const zakladka of zakladki.children) {
    zakladka.setAttribute('aria-selected', String(zakladka.dataset.idKonta === idKonta))
  }
}

async function odswiezZakladki() {
  const konta = await window.mostHub.listaKont()

  // Pasek odbudowuje sie po kazdej zmianie nazwy i kolejnosci. Bez zapamietanego
  // konta operator ladowalby wtedy za kazdym razem na pierwszej zakladce.
  const wybrane = konta.some((k) => k.id === aktywneKontoId) ? aktywneKontoId : konta[0]?.id ?? null

  zakladki.replaceChildren()
  for (const konto of konta) {
    const przycisk = document.createElement('button')
    przycisk.className = 'zakladka'
    przycisk.dataset.idKonta = konto.id
    przycisk.style.setProperty('--kolor-konta', konto.kolor)
    przycisk.setAttribute('aria-selected', String(konto.id === wybrane))

    const nazwa = document.createElement('span')
    nazwa.textContent = konto.nazwa
    przycisk.append(nazwa)

    przycisk.addEventListener('click', () => przelaczNa(konto.id))
    zakladki.append(przycisk)
  }

  if (wybrane) await przelaczNa(wybrane)
}

let edytowaneKontoId = null

function otworzFormularzKonta(konto = null) {
  edytowaneKontoId = konto?.id ?? null
  bledyKonta.textContent = ''

  const formularz = oknoKonta.querySelector('form')
  formularz.reset()
  document.getElementById('tytul-konta').textContent = konto ? 'Edycja konta' : 'Dodaj konto'

  // Platforma wyznacza adres i partycje sesji — jej podmiana bylaby innym kontem,
  // nie poprawka tego samego, wiec przy edycji pole jest zablokowane.
  const platforma = formularz.querySelector('select[name="platforma"]')
  platforma.disabled = Boolean(konto)

  if (konto) {
    formularz.querySelector('input[name="nazwa"]').value = konto.nazwa
    platforma.value = konto.platforma
    formularz.querySelector('input[name="kolor"]').value = konto.kolor
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
    bledyKonta.textContent = wynik.bledy.join('; ')
    return
  }

  edytowaneKontoId = null
  oknoKonta.close()
  await odswiezZakladki()
  if (oknoUstawien.open) await odswiezListeKont()
})

export async function odswiezMakra() {
  const makra = await window.mostHub.listaMakr(szukajka.value)
  listaMakr.replaceChildren()
  if (!makra.length) {
    const puste = document.createElement('li')
    puste.className = 'puste'
    puste.textContent = 'Brak makr — kliknij "Nowe makro"'
    listaMakr.append(puste)
    return
  }
  for (const makro of makra) {
    const pozycja = document.createElement('li')
    const liczba = (makro.zalaczniki ?? []).length
    pozycja.dataset.idMakra = makro.id

    const etykieta = document.createElement('span')
    etykieta.className = 'etykieta-makra'
    etykieta.textContent = liczba ? `${makro.nazwa}  (${liczba} zal.)` : makro.nazwa

    // Klikniecie wiersza wstawia makro — to najczestsza czynnosc, wiec zostaje
    // najtansza. Przyciski zatrzymuja propagacje, zeby edycja i usuwanie nie
    // wstawialy makra przy okazji.
    pozycja.addEventListener('click', async () => {
      oknoMakr.close()
      const wynik = await window.mostHub.wstawMakro(makro.id)
      if (wynik && !wynik.ok && wynik.brakujace.length) {
        pokazKomunikat(
          `Brakuje zalacznikow w magazynie: ${wynik.brakujace.join(', ')}. Tekst zostal wstawiony.`,
        )
      }
    })

    const edytuj = document.createElement('button')
    edytuj.type = 'button'
    edytuj.className = 'edytuj-makro'
    edytuj.textContent = 'Edytuj'
    edytuj.title = `Edytuj makro ${makro.nazwa}`
    edytuj.addEventListener('click', (zdarzenie) => {
      zdarzenie.stopPropagation()
      otworzEdytor(makro)
    })

    const usun = document.createElement('button')
    usun.type = 'button'
    usun.className = 'usun-makro grozny'
    usun.textContent = 'Usun'
    usun.title = `Usun makro ${makro.nazwa}`
    usun.addEventListener('click', (zdarzenie) => {
      zdarzenie.stopPropagation()
      zapytajOUsuniecieMakra(makro)
    })

    pozycja.append(etykieta, edytuj, usun)
    listaMakr.append(pozycja)
  }
}

szukajka.addEventListener('input', odswiezMakra)

document.getElementById('otworz-makra').addEventListener('click', async () => {
  szukajka.value = ''
  await odswiezMakra()
  pokazDialog(oknoMakr)
  szukajka.focus()
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

// Spec sekcja 8: nieudany start ma dac jawny komunikat, nie pusty pasek.
function pokazKomunikat(tekst) {
  const pole = document.getElementById('komunikat')
  pole.textContent = tekst
  pole.hidden = false
}

async function start() {
  try {
    await odswiezZakladki()
  } catch (blad) {
    pokazKomunikat(`Nie udalo sie wczytac kont: ${blad.message}`)
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

window.mostHub.naLicznik((suma) => {
  window.mostHub.ustawNakladke(narysujLicznik(suma))
})

// Komunikaty z procesu glownego (np. nieudane ladowanie konta) ladują w pasku,
// nie w modalnym okienku — jedno chore konto nie blokuje pozostalych.
window.mostHub.naKomunikat(pokazKomunikat)

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
  document.getElementById('tytul-edytora').textContent = makro ? 'Edycja makra' : 'Nowe makro'
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
  const wynik = await window.mostHub.zapiszMakro({
    ...(edytowaneMakroId ? { id: edytowaneMakroId } : {}),
    nazwa: edytorNazwa.value,
    tekst: edytorTekst.value,
    zalaczniki: zalacznikiMakra,
  })
  if (!wynik.ok) {
    pokazKomunikat(wynik.bledy.join('; '))
    return
  }
  edytowaneMakroId = null
  oknoEdytora.close()
})

// Jawny sygnal, ze wszystkie nasluchy (w tym Ctrl+;) sa juz podpiete.
// Bez niego test nacisnalby skrot, zanim modul skonczy sie ladowac.
document.body.dataset.gotowy = '1'

let zalacznikiMakra = []

// Nazwa w magazynie ma prefiks UUID — operatorowi pokazujemy tylko oryginalna nazwe.
function odswiezZalaczniki() {
  const pole = document.getElementById('lista-zalacznikow')
  pole.replaceChildren()

  if (!zalacznikiMakra.length) {
    const puste = document.createElement('li')
    puste.className = 'puste'
    puste.textContent = 'brak'
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
    zdejmij.textContent = 'Zdejmij'
    zdejmij.title = `Zdejmij ${nazwa.textContent}`
    zdejmij.addEventListener('click', () => {
      zalacznikiMakra = zalacznikiMakra.filter((s) => s !== wzgledna)
      odswiezZalaczniki()
    })

    pozycja.append(nazwa, zdejmij)
    pole.append(pozycja)
  }
}

document.getElementById('dodaj-zalacznik').addEventListener('click', async () => {
  const wynik = await window.mostHub.wybierzPlik()
  if (!wynik) return
  if (wynik.blad) {
    pokazKomunikat(`Nie mozna dodac zalacznika: ${wynik.blad}`)
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
    puste.textContent = 'Brak kont — kliknij "Dodaj konto"'
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
    const wGore = document.createElement('button')
    wGore.type = 'button'
    wGore.className = 'w-gore'
    wGore.textContent = 'W gore'
    wGore.title = `Przesun ${konto.nazwa} w gore`
    wGore.disabled = indeks === 0
    wGore.addEventListener('click', () => przesunKonto(konto.id, -1))

    const wDol = document.createElement('button')
    wDol.type = 'button'
    wDol.className = 'w-dol'
    wDol.textContent = 'W dol'
    wDol.title = `Przesun ${konto.nazwa} w dol`
    wDol.disabled = indeks === konta.length - 1
    wDol.addEventListener('click', () => przesunKonto(konto.id, 1))

    const edytuj = document.createElement('button')
    edytuj.type = 'button'
    edytuj.className = 'edytuj-konto'
    edytuj.textContent = 'Edytuj'
    edytuj.title = `Edytuj konto ${konto.nazwa}`
    edytuj.addEventListener('click', () => otworzFormularzKonta(konto))

    const usun = document.createElement('button')
    usun.type = 'button'
    usun.className = 'usun-konto grozny'
    usun.textContent = 'Usun'
    usun.title = `Usun konto ${konto.nazwa}`
    usun.addEventListener('click', () => zapytajOUsuniecie(konto))

    pozycja.append(znacznik, opis, platforma, wGore, wDol, edytuj, usun)
    listaKont.append(pozycja)
  })
}

async function przesunKonto(idKonta, przesuniecie) {
  await window.mostHub.przesunKonto(idKonta, przesuniecie)
  await odswiezZakladki()
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
  document.getElementById('tresc-usuwania').textContent =
    `Konto "${konto.nazwa}" zniknie z paska zakladek.`
  pokazDialog(oknoUsuwania)
}

document.getElementById('anuluj-usuniecie').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  kontoDoUsuniecia = null
  oknoUsuwania.close()
})

document.getElementById('potwierdz-usuniecie').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  if (!kontoDoUsuniecia) return
  const wynik = await window.mostHub.usunKonto(kontoDoUsuniecia.id)
  kontoDoUsuniecia = null
  oknoUsuwania.close()
  if (!wynik.ok) {
    pokazKomunikat(wynik.bledy.join('; '))
    return
  }
  await odswiezZakladki()
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
    ? `Makro "${makro.nazwa}" zniknie razem z zalacznikami (${liczba}).`
    : `Makro "${makro.nazwa}" zniknie z listy.`
  pokazDialog(oknoUsuwaniaMakra)
}

document.getElementById('anuluj-usuniecie-makra').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  makroDoUsuniecia = null
  oknoUsuwaniaMakra.close()
})

document.getElementById('potwierdz-usuniecie-makra').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  if (!makroDoUsuniecia) return
  const wynik = await window.mostHub.usunMakro(makroDoUsuniecia.id)
  makroDoUsuniecia = null
  oknoUsuwaniaMakra.close()
  if (!wynik.ok) {
    pokazKomunikat(wynik.bledy.join('; '))
    return
  }
  await odswiezMakra()
})
