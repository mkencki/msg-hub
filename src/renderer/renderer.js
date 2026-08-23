import { naHtml } from './podglad.js'

const zakladki = document.getElementById('zakladki')
const oknoKonta = document.getElementById('okno-konta')
const bledyKonta = document.getElementById('bledy-konta')
const oknoMakr = document.getElementById('okno-makr')
const szukajka = document.getElementById('szukaj-makro')
const listaMakr = document.getElementById('lista-makr')

async function odswiezZakladki() {
  const konta = await window.mostHub.listaKont()
  zakladki.replaceChildren()
  konta.forEach((konto, indeks) => {
    const przycisk = document.createElement('button')
    przycisk.className = 'zakladka'
    przycisk.textContent = konto.nazwa
    przycisk.style.setProperty('--kolor-konta', konto.kolor)
    przycisk.setAttribute('aria-selected', String(indeks === 0))
    przycisk.addEventListener('click', async () => {
      await window.mostHub.przelacz(konto.id)
      for (const inny of zakladki.children) inny.setAttribute('aria-selected', 'false')
      przycisk.setAttribute('aria-selected', 'true')
    })
    zakladki.append(przycisk)
  })
  if (konta.length) await window.mostHub.przelacz(konta[0].id)
}

document.getElementById('dodaj-konto').addEventListener('click', () => {
  bledyKonta.textContent = ''
  pokazDialog(oknoKonta)
})

document.getElementById('zapisz-konto').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  const dane = Object.fromEntries(new FormData(oknoKonta.querySelector('form')))
  const wynik = await window.mostHub.dodajKonto(dane)
  if (!wynik.ok) {
    bledyKonta.textContent = wynik.bledy.join('; ')
    return
  }
  oknoKonta.close()
  await odswiezZakladki()
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
    pozycja.textContent = liczba ? `${makro.nazwa}  (${liczba} zal.)` : makro.nazwa
    pozycja.dataset.idMakra = makro.id
    pozycja.addEventListener('click', async () => {
      oknoMakr.close()
      const wynik = await window.mostHub.wstawMakro(makro.id)
      if (wynik && !wynik.ok && wynik.brakujace.length) {
        pokazKomunikat(
          `Brakuje zalacznikow w magazynie: ${wynik.brakujace.join(', ')}. Tekst zostal wstawiony.`,
        )
      }
    })
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

document.getElementById('nowe-makro').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  oknoMakr.close()
  edytorNazwa.value = ''
  edytorTekst.value = ''
  zalacznikiMakra = []
  odswiezZalaczniki()
  odswiezPodglad()
  pokazDialog(oknoEdytora)
})

document.getElementById('anuluj-makro').addEventListener('click', (zdarzenie) => {
  zdarzenie.preventDefault()
  oknoEdytora.close()
})

document.getElementById('zapisz-makro').addEventListener('click', async (zdarzenie) => {
  zdarzenie.preventDefault()
  const wynik = await window.mostHub.zapiszMakro({
    nazwa: edytorNazwa.value,
    tekst: edytorTekst.value,
    zalaczniki: zalacznikiMakra,
  })
  if (!wynik.ok) {
    pokazKomunikat(wynik.bledy.join('; '))
    return
  }
  oknoEdytora.close()
})

// Jawny sygnal, ze wszystkie nasluchy (w tym Ctrl+;) sa juz podpiete.
// Bez niego test nacisnalby skrot, zanim modul skonczy sie ladowac.
document.body.dataset.gotowy = '1'

let zalacznikiMakra = []

// Nazwa w magazynie ma prefiks UUID — operatorowi pokazujemy tylko oryginalna nazwe.
function odswiezZalaczniki() {
  const pole = document.getElementById('lista-zalacznikow')
  pole.textContent = zalacznikiMakra.length
    ? zalacznikiMakra.map((s) => s.replace(/^att\/[0-9a-f-]+-/, '')).join(', ')
    : 'brak'
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
  dialog.showModal()
  odswiezWidocznoscKont()
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('close', odswiezWidocznoscKont)
}
