import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const domyslneUruchom = promisify(execFile)

export const ZNACZNIK_GOTOWE = '@@MSGHUB-GOTOWE@@'
const LIMIT_CZASU_MS = 10000

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

// Droga jednorazowa: nowy proces na kazde wywolanie. Zostaje jako awaryjna,
// gdy sesja trwala padnie. Zmierzony koszt: mediana 668 ms (2026-08-23).
export async function ustawPlikWSchowku(sciezka, uruchom = domyslneUruchom) {
  if (!sciezka) return
  const { plik, argumenty } = zbudujPolecenie(sciezka)
  await uruchom(plik, argumenty, { windowsHide: true })
}

export function zbudujPolecenieSesji(sciezka) {
  return (
    `try { Set-Clipboard -LiteralPath ${cytujPS(sciezka)} -ErrorAction Stop } ` +
    `catch { Write-Output ('BLAD ' + $_.Exception.Message) }; Write-Output '${ZNACZNIK_GOTOWE}'\n`
  )
}

// Sesja trwala: JEDEN proces PowerShella na cala prace aplikacji, karmiony
// poleceniami przez stdin. Start kosztuje ~860 ms, ale kolejne wstawienia
// to mediana 15 ms zamiast 668 ms. Spec (sekcja 4.4) dopuszczal modul natywny
// powyzej progu 500 ms — ta droga schodzi ponizej progu bez nowej zaleznosci.
export function utworzSesjeSchowka(uruchomProces = spawn) {
  let proces = null

  const zapewnijProces = () => {
    if (proces && proces.exitCode === null && !proces.killed) return proces
    proces = uruchomProces(
      'powershell.exe',
      ['-NoProfile', '-STA', '-NonInteractive', '-Command', '-'],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    proces.stdout.setEncoding('utf8')
    proces.on('error', () => {
      proces = null
    })
    return proces
  }

  return {
    async ustawPlik(sciezka) {
      if (!sciezka) return
      const biezacy = zapewnijProces()

      const odpowiedz = new Promise((rozwiaz, odrzuc) => {
        let bufor = ''
        const zegar = setTimeout(() => {
          biezacy.stdout.off('data', naDane)
          odrzuc(new Error('PowerShell nie odpowiedzial w zalozonym czasie'))
        }, LIMIT_CZASU_MS)

        function naDane(kawalek) {
          bufor += kawalek
          if (!bufor.includes(ZNACZNIK_GOTOWE)) return
          clearTimeout(zegar)
          biezacy.stdout.off('data', naDane)
          const przed = bufor.slice(0, bufor.indexOf(ZNACZNIK_GOTOWE)).trim()
          if (przed.startsWith('BLAD')) odrzuc(new Error(przed.slice(5)))
          else rozwiaz()
        }

        biezacy.stdout.on('data', naDane)
      })

      biezacy.stdin.write(zbudujPolecenieSesji(sciezka))
      await odpowiedz
    },

    zamknij() {
      proces?.stdin?.end()
      proces = null
    },
  }
}
