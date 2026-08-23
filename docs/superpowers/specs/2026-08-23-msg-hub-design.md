# msg-hub — projekt aplikacji

Data projektu: 2026-08-23
Status: zatwierdzony do planu wdrożenia

## 1. Cel

Jedno okno na Windows dla trzech kont komunikatorów: Messenger, WhatsApp prywatny,
WhatsApp służbowy. Zastępuje płatną aplikację All-in-One Messenger Hub, która po
zakończeniu okresu przejściowego dla dotychczasowych użytkowników (2026-07-18) wymaga
licencji Pro do obsługi drugiego konta WhatsApp.

Projekt powstał po audycie tamtej aplikacji. Audyt wykazał, że jedyna realnie potrzebna
funkcja — wiele kont tej samej platformy — sprowadza się do izolowanych profili
przeglądarki i nie wymaga żadnego reverse-engineeringu. Wykazał też, że tamta aplikacja
ładuje `wppconnect-wa.js` (WPPConnect/wa-js v3.23.2), czyli bibliotekę ingerującą w
wewnętrzne funkcje WhatsApp Web — co narusza regulamin WhatsAppa i grozi trwałą blokadą
numeru. Numer służbowy operatora jest jednym z obsługiwanych kont, więc uniknięcie tej
kategorii narzędzi jest wymaganiem nadrzędnym, nie preferencją.

## 2. Zakres

### W zakresie

- trzy (docelowo dowolnie wiele) kont w jednym oknie, każde w izolowanej sesji
- konfigurowalna lista kont w pliku JSON plus ekran dodawania konta w aplikacji
- makra: zapisane fragmenty tekstu z formatowaniem WhatsApp oraz załączniki
- tryb ciemny, zapamiętywanie rozmiaru i pozycji okna
- ikona w zasobniku systemowym, autostart z Windows
- powiadomienia systemowe i licznik nieprzeczytanych na ikonie paska zadań

### Poza zakresem

- blokada okna PIN-em lub Windows Hello (odrzucone przez operatora)
- osobne reguły dla konta służbowego, harmonogram wyciszania (odrzucone)
- most powiadomień do `ntfy` (odłożone; wraca tylko, jeśli powiadomienia natywne zawiodą)
- jakakolwiek automatyczna wysyłka wiadomości (zakaz — patrz sekcja 7)
- eksport kontaktów, chatboty, odpowiedzi AI (kategoria `wa-js`, zakaz — patrz sekcja 7)
- wersja webowa i dostęp z laptopa służbowego (wycofane przez operatora 2026-08-23)

## 3. Architektura

Pojedyncza aplikacja Electron uruchamiana lokalnie na `hp-x360-win`. Bez serwera, bez
kontenerów, bez zależności od infrastruktury `homeserver-infra`.

```
okno główne (BrowserWindow)
├── pasek zakładek + panel makr        ← renderer, zwykły HTML/CSS
└── obszar treści
    ├── WebContentsView  session persist:acc-messenger  → messenger.com
    ├── WebContentsView  session persist:acc-wa-priv    → web.whatsapp.com
    └── WebContentsView  session persist:acc-wa-work    → web.whatsapp.com
```

Izolację daje osobna partycja sesji na konto. Dwa konta WhatsApp widzą się nawzajem jak
dwie niezależne przeglądarki — nie współdzielą ciasteczek, `localStorage` ani
`IndexedDB`. To jest sedno aplikacji i jedyny mechanizm, bez którego nie ma produktu.

`WebContentsView` jest obecnym API Electrona dla wielu widoków; `BrowserView` jest
wycofany, a znacznik `webview` odradzany przez samo Electron. Dla treści wymagającej
własnej sesji dokumentacja wskazuje wprost `WebContentsView` z osobną partycją.

## 4. Komponenty

Każdy komponent ma jedną odpowiedzialność i daje się testować osobno.

### 4.1 `accounts` — rejestr kont

Czyta i zapisuje listę kont, nadaje identyfikatory partycji. Nie wie nic o oknach.

### 4.2 `views` — zarządca widoków

Tworzy `WebContentsView` na konto, przypina sesję, ustawia `User-Agent`, panuje nad
geometrią przy zmianie rozmiaru okna, przełącza aktywny widok. Nie wie, skąd wzięła się
lista kont.

### 4.3 `macros` — magazyn makr

Przechowuje definicje makr i kopie załączników, wyszukuje po nazwie i treści. Nie wie,
jak makro trafia do czatu.

### 4.4 `insert` — wstawianie treści

Kładzie tekst lub plik do schowka i wywołuje wklejenie w aktywnym widoku. Jedyny
komponent dotykający schowka. Nie wysyła wiadomości — nigdy (sekcja 7).

### 4.5 `shell` — powłoka okna

Okno, zasobnik, autostart, tryb ciemny, zapamiętany układ, powiadomienia, badge.

## 5. Model danych

Wszystko w katalogu danych aplikacji (`app.getPath('userData')`).

### 5.1 `accounts.json`

```json
{
  "wersja": 1,
  "konta": [
    {
      "id": "acc-wa-work",
      "nazwa": "WhatsApp służbowy",
      "platforma": "whatsapp",
      "url": "https://web.whatsapp.com/",
      "kolor": "#2f7d5b"
    }
  ]
}
```

`id` jest niezmienny — służy jako nazwa partycji (`persist:acc-wa-work`). Zmiana `id`
oznacza utratę sesji, więc interfejs nie pozwala go edytować. `platforma` wybiera
domyślny adres i ikonę; `url` można nadpisać ręcznie.

### 5.2 `macros.json`

```json
{
  "wersja": 1,
  "makra": [
    {
      "id": "mac-strefa-klienta",
      "nazwa": "Instrukcja — Strefa Klienta",
      "tekst": "*Jak dodać kierowcę:*\n\n1. Zaloguj się\n2. Wejdź w zakładkę Kierowcy\n\n> W razie pytań proszę o kontakt.",
      "zalaczniki": ["att/4f2a-instrukcja.pdf"],
      "tagi": ["strefa", "instrukcja"]
    }
  ]
}
```

Pole `tekst` przechowuje **czysty tekst ze znacznikami WhatsAppa**, nie tekst wzbogacony.
WhatsApp obsługuje pogrubienie (gwiazdki), kursywę (podkreślniki), przekreślenie (tyldy),
blok kodu (potrójne backticki), kod w linii (pojedyncze backticki), cytat (znak większości
na początku linii), listę punktowaną (myślnik lub gwiazdka ze spacją) oraz numerowaną
(cyfra, kropka, spacja). Podkreślenia nie obsługuje. Znaczniki działają na desktopie
identycznie jak na telefonie.

Konsekwencja przyjęta świadomie: znaczniki są WhatsAppowe. Ten sam tekst wklejony w
Messengerze pokaże surowe gwiazdki. Głównym odbiorcą makr są klienci na WhatsAppie, więc
format docelowy to WhatsApp.

### 5.3 Magazyn załączników

Załącznik dodany do makra jest **kopiowany** do katalogu `att/` w danych aplikacji, pod
nazwą z prefiksem UUID. To realizuje wymaganie operatora: pliki mają żyć w aplikacji, żeby
nie szukać ich za każdym razem na dysku. Usunięcie makra usuwa niepowiązane kopie.

Interfejs pokazuje łączną zajętość magazynu. Limit pojedynczego pliku: 100 MB — bezpiecznie
poniżej limitów WhatsAppa, a powyżej typowej instrukcji wideo.

## 6. Przepływy

### 6.1 Start aplikacji

1. Wczytanie `accounts.json`; przy braku pliku — kreator pierwszego konta.
2. Utworzenie widoku na konto, z sesją `persist:<id>` i nadpisanym `User-Agent`.
3. Przywrócenie rozmiaru i pozycji okna oraz ostatnio aktywnej zakładki.
4. Widoki nieaktywne ładują się w tle, żeby powiadomienia działały dla wszystkich kont.

### 6.2 Użycie makra

1. Panel makr (skrót `Ctrl+;`) z wyszukiwarką po nazwie i treści.
2. Wybór makra wstawia tekst do pola wiadomości aktywnego czatu.
3. Jeśli makro ma załącznik — wstawiany jest osobnym krokiem, po tekście.
4. **Aplikacja zatrzymuje się.** Wiadomość wysyła operator klawiszem Enter.

### 6.3 Dodanie konta

Ekran „Dodaj konto": nazwa, platforma z listy, opcjonalnie własny adres i kolor zakładki.
Zapis do `accounts.json`, utworzenie widoku, logowanie kodem QR lub formularzem platformy —
tak samo jak w przeglądarce.

## 7. Granice bezpieczeństwa

Trzy reguły, których projekt nie przekracza. Wynikają wprost z audytu z 2026-08-23.

**7.1 Aplikacja nie wysyła wiadomości.** Makro przygotowuje treść i się zatrzymuje.
Przygotowanie wiadomości jest zachowaniem użytkownika; automatyczna wysyłka byłaby
automatyzacją, przed którą audyt ostrzegał. Granica jest tu, nie dalej.

**7.2 Aplikacja nie ładuje `wa-js`, WPPConnect, Baileys ani biblioteki pokrewnej.** Żadnego
dostępu do wewnętrznych funkcji WhatsApp Web. Strony ładowane są takie, jakie serwuje Meta.

**7.3 Wstawianie treści odbywa się przez schowek.** Schowek i wklejenie są nie do
odróżnienia od działania ręcznego. Jedyne dopuszczalne odstępstwo opisuje sekcja 9, etap 0,
i wymaga osobnej decyzji operatora.

Poza tymi regułami aplikacja jest zwykłą przeglądarką z zakładkami.

## 8. Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| `accounts.json` uszkodzony | kopia zapasowa obok, start z pustą listą, komunikat |
| brak sieci | widok pokazuje stan platformy; aplikacja nie interweniuje |
| WhatsApp odrzuca klienta (`User-Agent`) | jawny komunikat z podpowiedzią aktualizacji |
| brak pliku załącznika w magazynie | makro oznaczone jako niekompletne, tekst działa |
| plik ponad limit | odmowa dodania z podaniem rozmiaru i limitu |
| sesja wylogowana | widok pokazuje kod QR; aplikacja nie interweniuje |

## 9. Etapy

**Etap 0 — rozstrzygnięcie schowka (bramka, około kwadransa).**
Sprawdzenie, czy WhatsApp Web przyjmuje wklejenie pliku PDF i mp4 ze schowka Windows
(format `CF_HDROP`). Test wykonuje operator na czacie z samym sobą.

- wynik pozytywny → załączniki idą przez schowek, reguła 7.3 bez odstępstw
- wynik negatywny → dla plików stosujemy podstawienie w standardowym polu wyboru pliku
  na stronie (mechanizm równoważny kliknięciu „załącz" i wybraniu pliku; nie dotyka
  wewnętrznych funkcji WhatsAppa, ale jest wrażliwy na przebudowę strony przez Metę).
  Decyzję o tym odstępstwie podejmuje operator po teście.

Obrazy i tekst działają przez schowek niezależnie od wyniku.

**Etap 1 — rdzeń.** `accounts`, `views`, `shell`. Trzy konta, izolacja, zakładki,
`User-Agent`, tryb ciemny, układ okna, zasobnik, autostart, powiadomienia.

**Etap 2 — makra tekstowe.** `macros`, `insert`, panel z wyszukiwarką, edytor z paskiem
formatowania i podglądem, skrót `Ctrl+;`.

**Etap 3 — załączniki.** Magazyn `att/`, wstawianie zgodnie z wynikiem etapu 0.

**Etap 4 — dystrybucja.** `electron-builder`, przenośny plik `.exe`, autostart.

## 10. Testy

Testowane jest zachowanie, nie szczegóły implementacji.

- **izolacja sesji** — dowód, że ciasteczko zapisane w partycji jednego konta jest
  niewidoczne w partycji drugiego. Sedno produktu, więc pokryte testem, nie oględzinami.
- `accounts` — odczyt, zapis, plik uszkodzony, plik nieobecny, odmowa zmiany `id`
- `macros` — dodanie, wyszukiwanie, usunięcie wraz z kopiami załączników, limit rozmiaru
- `insert` — treść trafia do schowka w oczekiwanej postaci; **test negatywny: żadna ścieżka
  nie wywołuje wysłania wiadomości** (egzekucja reguły 7.1)
- `shell` — układ okna przeżywa restart

## 11. Ryzyka

| Ryzyko | Waga | Reakcja |
|---|---|---|
| WhatsApp odrzuca klienta po `User-Agent` | wysoka | nadpisanie UA od pierwszego uruchomienia; etap 1 |
| Chromium w Electronie zbyt stary dla WhatsAppa | średnia | utrzymywanie świeżej wersji; naprawa = podbicie wersji |
| Schowek nie przyjmuje plików | średnia | rozstrzyga etap 0 przed budową etapu 3 |
| Przebudowa WhatsApp Web psuje podstawianie pliku | niska | dotyczy tylko wariantu negatywnego etapu 0 |
| Rozrost magazynu załączników | niska | limit pliku, licznik zajętości, kasowanie kopii z makrem |

## 12. Odrzucone warianty

Zapis dla pamięci — droga do tego projektu była długa i te ślepe zaułki są udokumentowane,
żeby nikt do nich nie wracał.

**Wersja webowa jako strona z zakładkami.** Niewykonalna. `web.whatsapp.com` wysyła
`frame-ancestors https://*.whatsapp.com https://whatsapp.com`, a `www.messenger.com` wysyła
`frame-ancestors 'self'`. Osadzenie w ramce na obcej domenie jest blokowane po stronie
przeglądarki. Obejście przez przepisujące proxy odrzucone: WhatsApp Web opiera się na
WebSocket, service workerach i Web Crypto, a taka manipulacja byłaby nieodróżnialna od ataku.

**Hub na serwerze streamowany przez Neko (WebRTC).** Odrzucony po analizie topologii: media
WebRTC idą po UDP, a ingress operatora to Cloudflare Tunnel na łączu CGNAT. Wymagałoby
serwera TURN albo otwartych portów UDP — pierwsze dokłada zależność rozliczaną za transfer,
drugie jest niemożliwe.

**Hub na serwerze streamowany przez KasmVNC.** Wykonalny technicznie (WebSocket przechodzi
przez tunel), zaprojektowany aż do etapu wdrożenia, po czym wycofany 2026-08-23 wraz z
rezygnacją z dostępu z laptopa służbowego. Kosztowałby WSL2 i Docker Engine na węźle
`hp-probookg8-win` — pierwszy kontener w tej infrastrukturze i trwałe poszerzenie
powierzchni utrzymania.

**Cloudflare browser-based RDP.** Sprawny wariant awaryjny, gdyby dostęp zdalny wrócił jako
wymaganie: dostępny na wszystkich planach, korzysta z istniejącego `cloudflared` i CF Access,
port RDP zostaje na loopbacku. Odpadł z tego samego powodu co wyżej.

**C# WPF z WebView2 oraz Tauri 2.** Lżejszy wynik (około 15 MB i 10 MB wobec około 200 MB),
ale pierwszy wymaga doinstalowania .NET SDK i wchodzi w stack odstający od warsztatu
operatora, a drugi wymaga toolchainu Rust i opiera się na młodym API wielu webview.
