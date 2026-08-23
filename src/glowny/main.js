import { app, BrowserWindow } from 'electron'
import { czystyUserAgent } from './widoki.js'

app.userAgentFallback = czystyUserAgent(app.userAgentFallback)

function utworzOkno() {
  const okno = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'msg-hub',
    backgroundColor: '#111b21',
  })
  okno.setTitle('msg-hub')
  return okno
}

app.whenReady().then(() => {
  utworzOkno()
})

app.on('window-all-closed', () => {
  app.quit()
})
