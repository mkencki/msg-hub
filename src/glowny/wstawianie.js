// REGULA 7.1 specu: ten modul NIGDY nie wysyla wiadomosci.
// Nie wolno tu dodac sendInputEvent z Enterem ani executeJavaScript.
// Test "NIE wysyla wiadomosci" w tests/wstawianie.test.js pilnuje tej granicy.

export function wstawTekst(webContents, tekst, schowek) {
  if (!webContents || !schowek) return
  const tresc = String(tekst ?? '')
  if (!tresc) return
  schowek.writeText(tresc)
  webContents.paste()
}
