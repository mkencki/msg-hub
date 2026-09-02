## Before you install / Zanim zainstalujesz

**English.** This installer is **not code-signed** — there is no paid certificate behind it.
Windows treats every unsigned installer as unknown, and you will meet one of two reactions:

| What you see | What it is | What to do |
|---|---|---|
| Blue box: *"Windows protected your PC"* | SmartScreen warning | Click **More info**, then **Run anyway** |
| *"An Application Control policy has blocked this file"*, or nothing happens at all | **Smart App Control** blocked it | The block cannot be lifted for a single app — see below |

**Smart App Control** is on by default on clean Windows 11 installs (machines upgraded from
Windows 10 usually have it off). It allows unsigned programs only when Microsoft's cloud has
already built a reputation for that exact file, and a freshly built one never has. Right-click →
Properties → **Unblock** does *not* help: the block survives it.

Turning Smart App Control off is a **one-way** change — switching it back on requires reinstalling
Windows. Do not do it for one app. Instead, run M-HUB from source, which works even with Smart
App Control enabled, because Electron's own binary is trusted:

```
git clone https://github.com/mkencki/m-hub.git
cd m-hub
npm install
npm start
```

You need [Node.js](https://nodejs.org/) for that. To check whether Smart App Control is on:
**Windows Security → App & browser control → Smart App Control settings**.

---

**Po polsku.** Ten instalator **nie jest podpisany cyfrowo** — nie stoi za nim płatny certyfikat.
Windows traktuje każdy niepodpisany instalator jako nieznany i zareaguje na jeden z dwóch sposobów:

| Co widzisz | Co to jest | Co zrobić |
|---|---|---|
| Niebieskie okno: *„System Windows ochronił Twój komputer"* | ostrzeżenie SmartScreen | Kliknij **Więcej informacji**, potem **Uruchom mimo to** |
| *„Zasady kontroli aplikacji zablokowały ten plik"* albo nie dzieje się nic | zablokował **Smart App Control** | Blokady nie da się zdjąć dla pojedynczej aplikacji — patrz niżej |

**Smart App Control** jest domyślnie włączony na czystych instalacjach Windows 11 (komputery
zaktualizowane z Windows 10 zwykle mają go wyłączonego). Przepuszcza niepodpisany program tylko
wtedy, gdy chmura Microsoftu zdążyła wyrobić reputację dokładnie temu plikowi — a świeżo zbudowany
żadnej nie ma. Prawoklik → Właściwości → **Odblokuj** **nie pomaga**: blokada to przeżywa.

Wyłączenie Smart App Control jest **nieodwracalne** — ponowne włączenie wymaga reinstalacji
Windows. Nie rób tego dla jednej aplikacji. Uruchom M-HUB ze źródeł — to działa nawet przy
włączonym Smart App Control, bo binarka Electrona jest zaufana:

```
git clone https://github.com/mkencki/m-hub.git
cd m-hub
npm install
npm start
```

Potrzebujesz do tego [Node.js](https://nodejs.org/). Stan Smart App Control sprawdzisz w:
**Zabezpieczenia Windows → Kontrola aplikacji i przeglądarki → Ustawienia Smart App Control**.

---

## Instalacja i aktualizacja / Installing and updating

**Po polsku.** Od 0.5.3 instalator jest **jednoklikowy**: nie pyta o katalog ani o to, czy
instalować dla wszystkich użytkowników. Instaluje na koncie bieżącego użytkownika, w
`%LOCALAPPDATA%\Programs\M-HUB`, więc nigdy nie prosi o hasło administratora.

Uruchomiony tam, gdzie M-HUB już jest, **aktualizuje istniejącą instalację**: NSIS odinstalowuje
poprzednią wersję i zajmuje jej miejsce. Zostaje jeden wpis w *Ustawienia → Aplikacje* i jeden
katalog w `Programs`. Profil (`%APPDATA%\M-HUB`) nie jest ruszany — konta, makra, załączniki i
zalogowane sesje przechodzą na nową wersję. Tak działo się i wcześniej, ale kreator pytał po
drodze o tryb i katalog, więc aktualizacja wyglądała jak instalacja od zera.

Przełącznik ciszy `/S` na instalatorze **kreatorowym** (0.5.2 i starsze) był zepsuty — zmierzone
2026-08-26: kopiował pliki i zakładał skróty, ale nie zapisywał **nic** w rejestrze, więc
aplikacja nie pojawiała się w *Ustawieniach*, a instalator przy następnym uruchomieniu uznawał
instalację za świeżą. Dla instalatora jednoklikowego **nie zostało to zmierzone ponownie**, więc
do czasu takiego pomiaru klikaj instalator normalnie. Odinstalowanie zawsze działa przez
`Uninstall M-HUB.exe` w katalogu instalacji, niezależnie od rejestru.

**English.** From 0.5.3 the installer is **one-click**: it asks for neither a directory nor
per-user versus all-users. It installs under the current account, in
`%LOCALAPPDATA%\Programs\M-HUB`, so it never asks for an administrator password.

Run where M-HUB is already installed, it **updates that installation**: NSIS uninstalls the
previous version and takes its place. One entry in *Settings → Installed apps*, one folder under
`Programs`. The profile (`%APPDATA%\M-HUB`) is left alone — accounts, macros, attachments and
signed-in sessions carry over. That was true before as well, but the wizard asked for an install
mode and a directory along the way, so an upgrade looked like a first installation.

The silent switch `/S` was broken on the **wizard** installer (0.5.2 and earlier) — measured
2026-08-26: it copied the files and created the shortcuts but wrote **nothing** to the registry,
so the application did not appear in *Settings*, and the installer treated the next run as a
fresh install. This has **not been measured again** on the one-click installer, so until somebody
does, click the installer normally. Uninstalling always works through `Uninstall M-HUB.exe` in
the installation folder, registry or no registry.
