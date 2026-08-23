import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const domyslneUruchom = promisify(execFile)

// Set-Clipboard -LiteralPath istnieje TYLKO w Windows PowerShell 5.1.
// PowerShell 7 (pwsh) tego parametru nie ma — stad jawne powershell.exe.
// Zweryfikowane empirycznie w etapie 0 specu (2026-08-23).
export function cytujPS(tekst) {
  return `'${String(tekst).replace(/'/g, "''")}'`
}

export function zbudujPolecenie(sciezka) {
  return {
    plik: 'powershell.exe',
    argumenty: ['-NoProfile', '-STA', '-Command', `Set-Clipboard -LiteralPath ${cytujPS(sciezka)}`],
  }
}

export async function ustawPlikWSchowku(sciezka, uruchom = domyslneUruchom) {
  if (!sciezka) return
  const { plik, argumenty } = zbudujPolecenie(sciezka)
  await uruchom(plik, argumenty, { windowsHide: true })
}
