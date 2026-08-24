// Preload sandboxowanego renderera musi byc CommonJS — Electron nie laduje tu ESM.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mostHub', {
  listaKont: () => ipcRenderer.invoke('konta:lista'),
  dodajKonto: (dane) => ipcRenderer.invoke('konta:dodaj', dane),
  usunKonto: (idKonta) => ipcRenderer.invoke('konta:usun', idKonta),
  wolnyKolor: () => ipcRenderer.invoke('konta:wolny-kolor'),
  zmienKonto: (idKonta, zmiany) => ipcRenderer.invoke('konta:zmien', idKonta, zmiany),
  przesunKonto: (idKonta, przesuniecie) =>
    ipcRenderer.invoke('konta:przesun', idKonta, przesuniecie),
  przelacz: (idKonta) => ipcRenderer.invoke('konta:przelacz', idKonta),
  ustawWidocznoscKont: (czy) => ipcRenderer.invoke('okna:widocznosc-kont', czy),
  stanSzyny: () => ipcRenderer.invoke('szyna:stan'),
  najazdSzyny: (czy) => ipcRenderer.invoke('szyna:najazd', czy),
  przypnijSzyne: (czy) => ipcRenderer.invoke('szyna:przypnij', czy),
  naZmianeSzyny: (sluchacz) => ipcRenderer.on('szyna:zmiana', (_zdarzenie, stan) => sluchacz(stan)),
  naKomunikat: (sluchacz) => ipcRenderer.on('komunikat:pokaz', (_zdarzenie, tekst) => sluchacz(tekst)),
  naLicznik: (sluchacz) => ipcRenderer.on('licznik:zmiana', (_zdarzenie, suma) => sluchacz(suma)),
  ustawNakladke: (obrazek) => ipcRenderer.invoke('licznik:nakladka', obrazek),
  naOtwarcieMakr: (sluchacz) => ipcRenderer.on('makra:otworz', () => sluchacz()),
  listaMakr: (fraza) => ipcRenderer.invoke('makra:lista', fraza),
  zapiszMakro: (makro) => ipcRenderer.invoke('makra:zapisz', makro),
  usunMakro: (idMakra) => ipcRenderer.invoke('makra:usun', idMakra),
  wstawMakro: (idMakra) => ipcRenderer.invoke('makra:wstaw', idMakra),
  wybierzPlik: () => ipcRenderer.invoke('pliki:wybierz'),
})
