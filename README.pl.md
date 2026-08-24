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
| **Szyna kanałów** | zwijana do samych kolorów kanałów, rozwija się na najazd kursora, przypinana na stałe; licznik nowych przy każdym koncie |
| **Ustawienia** | zarządzanie kontami: dodanie, zmiana nazwy i koloru, kolejność zakładek, usunięcie wraz z czyszczeniem sesji |
| **Makra** | `Ctrl+;` — paleta z wyszukiwarką, wyborem strzałkami i Enterem; edycja i usuwanie za potwierdzeniem |
| **Edytor makra** | pasek formatowania WhatsApp, podgląd na żywo, dodawanie i zdejmowanie załączników |
| **Załączniki** | PDF i mp4 **kopiowane do magazynu aplikacji** — oryginalny plik przestaje być potrzebny; limit 100 MB |

Makra i załączniki żyją w `%APPDATA%\msg-hub` (`macros.json` oraz katalog `att/`),
konta w `accounts.json` obok nich. Usunięcie makra albo zdjęcie załącznika sprząta
magazyn, żeby kilkumegabajtowe wideo nie zostawało na dysku bez właściciela.

Zmiana nazwy konta **nie rusza jego identyfikatora**, bo na identyfikatorze stoi
partycja sesji (`persist:<id>`) — poprawka literówki nie wylogowuje konta.

## Interfejs: konsola operatora

Aplikacja obudowuje cudzy interfejs, więc jej własne chrome jest celowo odbarwione —
jedynym nasyconym kolorem w oknie jest kolor aktywnego konta. Obrysowuje on całe okno
robocze, bo jedyne realne ryzyko tego produktu to **pomylenie tożsamości**: wysłanie
treści z prywatnego WhatsAppa do kontaktu służbowego albo odwrotnie. Formularz nowego
konta podpowiada kolor jeszcze nieużywany, żeby dwa konta nie wyglądały tak samo.

Kanały stoją w szynie po lewej, nie w zakładkach u góry: WhatsApp Web i Messenger mają
własny nagłówek, więc pasek nad paskiem tworzył wizualną papkę. Szyna zwija się do 48 px
i rozwija na najazd kursora — przycisk pinezki u góry trzyma ją rozwiniętą na stałe,
a wybór przeżywa restart. Rozwinięcie **odsuwa** widok konta zamiast go zakrywać:
widoki są natywną warstwą nad rendererem, więc nakładka narysowana w HTML schowałaby się
pod stroną komunikatora. Prawdziwa nakładka wymagałaby osobnego natywnego widoku dla szyny. Paleta makr nazywa konto
docelowe, a po wstawieniu listwa melduje, co i dokąd poszło — i przypomina, że Enter
należy do operatora.

Kroje są systemowe, **bez ani jednego zapytania do sieci**: aplikacja powstała z audytu
prywatności, więc pobieranie czcionek z cudzego serwera przy każdym starcie byłoby z nią
niespójne. Etykiety konsoli składa Bahnschrift — windowsowa pochodna DIN 1451, pisma
niemieckich znaków drogowych.

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
