# msg-hub

Aplikacja desktopowa na Windows: Messenger i dwa konta WhatsApp w jednym oknie,
każde w izolowanej sesji, plus makra tekstowe z załącznikami.

Interfejs po **polsku** i **angielsku**. Domyślny jest angielski — polski wybierzesz
w Ustawieniach.

**[English version of this README](README.md)**

Zastępuje płatną aplikację **All-in-One Messenger Hub**, która od 2026-07-18 wymaga
licencji Pro do drugiego konta WhatsApp. Audyt tamtej aplikacji (sekcja 1 specu) wykazał
dwa powody, żeby jej nie kupować: nieosiągalny podmiot odpowiedzialny za dane oraz
`wppconnect-wa.js` na pokładzie, czyli bibliotekę ingerującą w wewnętrzne funkcje
WhatsApp Web — a to grozi trwałą blokadą numeru.

## Instalacja

Instalator leży w [Releases](https://github.com/mkencki/msg-hub/releases).

> **Instalator nie jest podpisany cyfrowo.** Windows ostrzeże, a na czystej instalacji
> Windows 11 **Smart App Control zablokuje go całkiem**. Przeczytaj
> **[docs/installing.md](docs/installing.md)** — tłumaczy, którą z dwóch
> reakcji właśnie widzisz i co z każdą zrobić.

Uruchomienie ze źródeł działa nawet przy włączonym Smart App Control:

```bash
npm install
npm start
```

Skrót w menu Start wskazuje `node_modules/electron/dist/electron.exe` z katalogiem projektu.

## Co robi

| | |
|---|---|
| **Konta** | dowolnie wiele, każde w partycji `persist:<id>` — pełna izolacja ciasteczek, `localStorage` i `IndexedDB` |
| **Szyna kanałów** | zwijana do samych kolorów kanałów, rozwija się na najazd kursora, przypinana na stałe; licznik nowych przy każdym koncie |
| **Ustawienia** | zarządzanie kontami: dodanie, zmiana nazwy i koloru, kolejność zakładek, usunięcie wraz z czyszczeniem sesji |
| **Makra** | `Ctrl+;` — paleta z wyszukiwarką, wyborem strzałkami i Enterem; edycja i usuwanie za potwierdzeniem |
| **Edytor makra** | pasek formatowania WhatsApp, podgląd na żywo, dodawanie i zdejmowanie załączników |
| **Załączniki** | PDF i mp4 **kopiowane do magazynu aplikacji** — oryginalny plik przestaje być potrzebny; limit 100 MB |
| **Język** | angielski i polski, przełączany w Ustawieniach bez restartu; wybór przeżywa restart |

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

Reguły 1 i 2 mają egzekucję w testach — [`tests/insertion.test.js`](tests/insertion.test.js)
i [`tests/boundaries.test.js`](tests/boundaries.test.js) zapadną się, jeśli ktoś kiedyś doda
zakazaną zależność albo ścieżkę wysyłki.

## Dokumentacja

- [`docs/design.md`](docs/design.md)
  — projekt: audyt, architektura, model danych, granice bezpieczeństwa, odrzucone warianty

## Testy

```bash
npm test          # Vitest — logika
npm run test:e2e  # Playwright + Electron — ścieżki operatora na prawdziwym oknie
npm run dist      # przenośny .exe (buduje się lokalnie)
```

**Instalator** buduje [CI](.github/workflows/build.yml), nie maszyna lokalna: NSIS generuje
deinstalator, URUCHAMIAJĄC świeżo zbudowany instalator, a Smart App Control to ubija. Runner
GitHuba nie ma SAC, więc `npm run dist:installer` należy do niego.

Test paczki pomija się sam, ale **na zmierzonej próbie uruchomienia**, nie na odczycie rejestru —
wcześniej milczał zawsze, gdy SAC był włączony, także wtedy, gdy paczka działała.

Teksty interfejsu siedzą w [`src/shared/locales/`](src/shared/locales/) pod kluczami, nie
w kodzie. Test jednostkowy czerwieni się, gdy słowniki się rozjadą — inaczej nowy napis trafiłby
do jednego języka, a drugi pokazywałby goły klucz dopiero u użytkownika.

## Znane ograniczenia środowiska

**Smart App Control blokuje własny `.exe`.** Na `hp-x360-win` polityka jest włączona
(`VerifiedAndReputablePolicyState = 0x1`) i odmawia uruchomienia świeżo zbudowanej paczki:
„An Application Control policy has blocked this file". Dotyczy to i `dist/win-unpacked`,
i przenośnego `.exe`. `electron.exe` startuje bez przeszkód — jest równie niepodpisany,
ale ma reputację w chmurze Microsoftu, której unikatowy własny build mieć nie może.

Pomiary z 2026-08-24, bo temat kusi do złych wniosków:

| Próba | Wynik |
|---|---|
| paczka sprzed ~20 h, bez znacznika MotW | **działa** |
| ta sama paczka przebudowana przed chwilą | **zablokowana** |
| kopia w `Downloads` ze znacznikiem `ZoneId=3` | **zablokowana** |
| ta kopia po `Unblock-File` (znacznik zdjęty) | **dalej zablokowana** |

Zmienną nie jest więc Mark of the Web, tylko **reputacja**: świeży plik żadnej nie ma, a raz
zapadła blokada nie cofa się po zdjęciu znacznika. Wniosek „znajomy odblokuje plik prawoklikiem"
jest **fałszywy** — sprawdzony i obalony. Jedynym realnym wyjściem jest certyfikat do podpisu
kodu; do czasu jego zakupu instalator działa wyłącznie tam, gdzie SAC jest wyłączony.

**Wstawianie plików idzie przez Windows PowerShell 5.1.** `Set-Clipboard -LiteralPath`
i `Get-Clipboard -Format` **nie istnieją w PowerShell 7** — stąd jawne `powershell.exe`,
nigdy `pwsh`. Aplikacja trzyma jedną sesję PowerShella przez cały czas pracy: wstawienie
pliku kosztuje wtedy 15 ms zamiast 668 ms na proces jednorazowy.

## Stack

Node 26, Electron 43, czysty JavaScript ESM bez bundlera. Vitest, Playwright, electron-builder.

**Kod jest po angielsku** — nazwy plików, identyfikatory, komentarze, klucze JSON i opisy testów.
Nie zawsze tak było: aplikacja zaczęła jako prywatne narzędzie pisane po polsku i wersja 1 formatu
na dysku nadal ma polskie klucze. Odczyt przyjmuje obie pisownie, a najbliższy zapis odkłada
wersję 2 — aktualizacja nie kosztuje nikogo kont ani makr. Pilnuje tego
[`tests/migration.test.js`](tests/migration.test.js).

## Licencja

[MIT](LICENSE) © 2026 Marek Kencki
