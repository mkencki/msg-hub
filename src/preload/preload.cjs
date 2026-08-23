// Preload sandboxowanego renderera musi byc CommonJS — Electron nie laduje tu ESM.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mostHub', {
  listaKont: () => ipcRenderer.invoke('konta:lista'),
  dodajKonto: (dane) => ipcRenderer.invoke('konta:dodaj', dane),
  usunKonto: (idKonta) => ipcRenderer.invoke('konta:usun', idKonta),
  przelacz: (idKonta) => ipcRenderer.invoke('konta:przelacz', idKonta),
  ustawWidocznoscKont: (czy) => ipcRenderer.invoke('okna:widocznosc-kont', czy),
  naKomunikat: (sluchacz) => ipcRenderer.on('komunikat:pokaz', (_zdarzenie, tekst) => sluchacz(tekst)),
  naLicznik: (sluchacz) => ipcRenderer.on('licznik:zmiana', (_zdarzenie, suma) => sluchacz(suma)),
  ustawNakladke: (obrazek) => ipcRenderer.invoke('licznik:nakladka', obrazek),
  listaMakr: (fraza) => ipcRenderer.invoke('makra:lista', fraza),
  zapiszMakro: (makro) => ipcRenderer.invoke('makra:zapisz', makro),
  wstawMakro: (idMakra) => ipcRenderer.invoke('makra:wstaw', idMakra),
  wybierzPlik: () => ipcRenderer.invoke('pliki:wybierz'),
})
