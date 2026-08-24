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
Windows. Do not do it for one app. Instead, run msg-hub from source, which works even with Smart
App Control enabled, because Electron's own binary is trusted:

```
git clone https://github.com/mkencki/msg-hub.git
cd msg-hub
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
Windows. Nie rób tego dla jednej aplikacji. Uruchom msg-hub ze źródeł — to działa nawet przy
włączonym Smart App Control, bo binarka Electrona jest zaufana:

```
git clone https://github.com/mkencki/msg-hub.git
cd msg-hub
npm install
npm start
```

Potrzebujesz do tego [Node.js](https://nodejs.org/). Stan Smart App Control sprawdzisz w:
**Zabezpieczenia Windows → Kontrola aplikacji i przeglądarki → Ustawienia Smart App Control**.
