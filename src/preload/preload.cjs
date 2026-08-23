// Preload sandboxowanego renderera musi byc CommonJS — Electron nie laduje tu ESM.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mostHub', {
  listaKont: () => ipcRenderer.invoke('konta:lista'),
  dodajKonto: (dane) => ipcRenderer.invoke('konta:dodaj', dane),
  przelacz: (idKonta) => ipcRenderer.invoke('konta:przelacz', idKonta),
  naLicznik: (sluchacz) => ipcRenderer.on('licznik:zmiana', (_zdarzenie, suma) => sluchacz(suma)),
  ustawNakladke: (obrazek) => ipcRenderer.invoke('licznik:nakladka', obrazek),
})
