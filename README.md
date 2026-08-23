# msg-hub

Aplikacja desktopowa na Windows: Messenger i dwa konta WhatsApp w jednym oknie,
każde w izolowanej sesji, plus makra tekstowe z załącznikami.

Zastępuje płatną aplikację **All-in-One Messenger Hub**, która od 2026-07-18 wymaga
licencji Pro do drugiego konta WhatsApp. Audyt tamtej aplikacji (sekcja 1 specu) wykazał
dwa powody, żeby jej nie kupować: nieosiągalny podmiot odpowiedzialny za dane oraz
`wppconnect-wa.js` na pokładzie, czyli bibliotekę ingerującą w wewnętrzne funkcje
WhatsApp Web — a to grozi trwałą blokadą numeru.

## Uruchomienie

```bash
npm install
npm start
```

Skrót w menu Start wskazuje `node_modules/electron/dist/electron.exe` z katalogiem
projektu. **Nie używaj `npm run dist`** jako drogi codziennej: Smart App Control na
`hp-x360-win` blokuje własny, niepodpisany `.exe` (szczegóły niżej).

## Co robi

| | |
|---|---|
| **Konta** | dowolnie wiele, każde w partycji `persist:<id>` — pełna izolacja ciasteczek, `localStorage` i `IndexedDB` |
| **Zakładki** | przełączanie bez przeładowania strony, kolor per konto, licznik nieprzeczytanych |
| **Ustawienia** | sekcja zarządzania kontami: dodawanie i usuwanie wraz z czyszczeniem sesji |
| **Makra** | `Ctrl+;` — panel z wyszukiwarką po nazwie, treści i tagach |
| **Edytor makra** | pasek formatowania WhatsApp i podgląd na żywo |
| **Załączniki** | PDF i mp4 w magazynie aplikacji, limit 100 MB na plik |

## Czego NIE robi — i nie będzie robić

Trzy granice z sekcji 7 specu. Wynikają z audytu i są nienaruszalne:

1. **Nie wysyła wiadomości.** Makro przygotowuje treść i się zatrzymuje. Enter należy
   do operatora.
2. **Nie ładuje `wa-js`, WPPConnect, Baileys ani niczego pokrewnego.** Strony ładowane
   są takie, jakie serwuje Meta.
3. **Wstawia wyłącznie przez schowek.** Bez manipulacji DOM stron, także przy załącznikach.

Reguły 1 i 2 mają egzekucję w testach — `tests/wstawianie.test.js` i `tests/granice.test.js`
zapadną się, jeśli ktoś kiedyś doda zakazaną zależność albo ścieżkę wysyłki.

## Dokumentacja

- [`docs/superpowers/specs/2026-08-23-msg-hub-design.md`](docs/superpowers/specs/2026-08-23-msg-hub-design.md)
  — projekt: audyt, architektura, model danych, granice bezpieczeństwa, odrzucone warianty
- [`docs/superpowers/plans/2026-08-23-msg-hub.md`](docs/superpowers/plans/2026-08-23-msg-hub.md)
  — plan wdrożenia z odstępstwami wykonawczymi i pomiarami

## Testy

```bash
npm test
npm run test:e2e
```

Vitest pokrywa logikę, Playwright z `_electron` — ścieżki operatora na prawdziwym oknie.
Test paczki pomija się sam, gdy wykryje włączony Smart App Control.

## Znane ograniczenia środowiska

**Smart App Control blokuje własny `.exe`.** Na `hp-x360-win` polityka jest włączona
(`VerifiedAndReputablePolicyState = 0x1`) i odmawia uruchomienia świeżo zbudowanej paczki:
„An Application Control policy has blocked this file". Dotyczy to i `dist/win-unpacked`,
i przenośnego `.exe`. `electron.exe` startuje bez przeszkód — jest równie niepodpisany,
ale ma reputację w chmurze Microsoftu, której unikatowy własny build mieć nie może.
Prawdziwy przenośny plik wymagałby certyfikatu do podpisu kodu.

**Wstawianie plików idzie przez Windows PowerShell 5.1.** `Set-Clipboard -LiteralPath`
i `Get-Clipboard -Format` **nie istnieją w PowerShell 7** — stąd jawne `powershell.exe`,
nigdy `pwsh`. Aplikacja trzyma jedną sesję PowerShella przez cały czas pracy: wstawienie
pliku kosztuje wtedy 15 ms zamiast 668 ms na proces jednorazowy.

## Stack

Node 26, Electron 43, czysty JavaScript ESM bez bundlera. Vitest, Playwright,
electron-builder. Nazwy plików, funkcji i kluczy JSON po polsku.
