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
  oknoKonta.showModal()
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
  oknoMakr.showModal()
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
