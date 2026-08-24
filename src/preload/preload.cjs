// The preload of a sandboxed renderer must be CommonJS — Electron does not load ESM here.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('msgHub', {
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (data) => ipcRenderer.invoke('accounts:add', data),
  removeAccount: (accountId) => ipcRenderer.invoke('accounts:remove', accountId),
  unusedColor: () => ipcRenderer.invoke('accounts:unused-color'),
  updateAccount: (accountId, changes) => ipcRenderer.invoke('accounts:update', accountId, changes),
  moveAccount: (accountId, offset) => ipcRenderer.invoke('accounts:move', accountId, offset),
  switchAccount: (accountId) => ipcRenderer.invoke('accounts:switch', accountId),
  setViewsVisible: (visible) => ipcRenderer.invoke('views:visibility', visible),
  getLanguage: () => ipcRenderer.invoke('language:get'),
  setLanguage: (code) => ipcRenderer.invoke('language:set', code),
  railState: () => ipcRenderer.invoke('rail:state'),
  hoverRail: (hovered) => ipcRenderer.invoke('rail:hover', hovered),
  pinRail: (pinned) => ipcRenderer.invoke('rail:pin', pinned),
  onRailChange: (listener) => ipcRenderer.on('rail:changed', (_event, state) => listener(state)),
  onMessage: (listener) => ipcRenderer.on('message:show', (_event, text) => listener(text)),
  onUnread: (listener) => ipcRenderer.on('unread:changed', (_event, data) => listener(data)),
  setOverlay: (image) => ipcRenderer.invoke('unread:overlay', image),
  onOpenMacros: (listener) => ipcRenderer.on('macros:open', () => listener()),
  listMacros: (phrase) => ipcRenderer.invoke('macros:list', phrase),
  saveMacro: (macro) => ipcRenderer.invoke('macros:save', macro),
  removeMacro: (macroId) => ipcRenderer.invoke('macros:remove', macroId),
  insertMacro: (macroId) => ipcRenderer.invoke('macros:insert', macroId),
  pickFile: () => ipcRenderer.invoke('files:pick'),
})
