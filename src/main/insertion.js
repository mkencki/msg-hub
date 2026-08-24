// SPEC RULE 7.1: this module NEVER sends a message.
// Do not add sendInputEvent carrying Enter, and do not add executeJavaScript here.
// The test "does NOT send a message" in tests/insertion.test.js guards this boundary.

export function insertText(webContents, text, clipboard) {
  if (!webContents || !clipboard) return
  const content = String(text ?? '')
  if (!content) return
  clipboard.writeText(content)
  webContents.paste()
}
