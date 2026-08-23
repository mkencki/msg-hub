const zakladki = document.getElementById('zakladki')
const oknoKonta = document.getElementById('okno-konta')
const bledyKonta = document.getElementById('bledy-konta')

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

odswiezZakladki()
