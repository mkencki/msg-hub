export const pl = {
  // Szyna kanałów
  channels: 'Kanały',
  pinRail: 'Przypnij panel',
  unpinRail: 'Odepnij panel',
  settings: 'Ustawienia',
  addAccount: 'Dodaj konto',
  noAccounts: 'Brak kont',

  // Listwa stanu
  macros: 'Makra',
  macrosWithShortcut: 'Makra (Ctrl+;)',
  dismissMessage: 'Ukryj komunikat',
  select: 'wybór',
  insert: 'wstaw',
  closeHint: 'zamknij',
  unreadNew: { one: '{n} nowa', few: '{n} nowe', many: '{n} nowych', other: '{n} nowych' },
  unreadTotal: {
    one: '{n} nieprzeczytana',
    few: '{n} nieprzeczytane',
    many: '{n} nieprzeczytanych',
    other: '{n} nieprzeczytanych',
  },
  noNew: 'brak nowych',
  allRead: 'wszystko przeczytane',

  // Okno konta
  editAccount: 'Edycja konta',
  name: 'Nazwa',
  platform: 'Platforma',
  channelColor: 'Kolor kanału',
  cancel: 'Anuluj',
  save: 'Zapisz',

  // Ustawienia
  accounts: 'Konta',
  orderHint: 'Kolejność na liście jest kolejnością kanałów.',
  language: 'Język',
  closeToTray: 'Zamknięcie okna zostawia msg-hub w zasobniku',
  closeToTrayHint: 'Gdy naprawdę chcesz go zamknąć, użyj „Zakończ” z ikony w zasobniku.',
  shortcutTaken: 'Inny program zajmuje {shortcut}, więc skrót do makr nie działa.',
  downloadStarted: 'Pobieranie {file} z konta {account}.',
  accountCrashed: 'Konto {account} przestało odpowiadać i zostało zamknięte ({reason}).',
  accountUnresponsive: 'Konto {account} nie odpowiada.',
  wokeUp: 'Komputer się obudził. Konta mogą wymagać przeładowania.',
  reloadAccount: 'Przeładuj',
  close: 'Zamknij',
  noAccountsHint: 'Brak kont — kliknij „Dodaj konto".',
  edit: 'Edytuj',
  remove: 'Usuń',
  editAccountTitle: 'Edytuj {name}',
  removeAccountTitle: 'Usuń {name}',
  moveUp: 'Przesuń {name} w górę',
  moveDown: 'Przesuń {name} w dół',

  // Usuwanie konta
  removeAccountQuestion: 'Usunąć to konto?',
  accountWillDisappear: '„{name}" zniknie z szyny kanałów.',
  removalWarning: 'Usunięcie konta kasuje też zalogowanie. Ponowne dodanie wymaga nowego kodu QR.',
  removeAccountButton: 'Usuń konto',

  // Makra
  insertInto: 'wstaw do',
  searchMacros: 'Szukaj po nazwie, treści lub tagu',
  noMacros: 'Brak makr — kliknij „Nowe makro".',
  nothingMatches: 'Nic nie pasuje do „{phrase}". Zmień frazę albo utwórz nowe makro.',
  newMacro: 'Nowe makro',
  macro: 'Makro',
  editMacro: 'Edycja makra',
  editMacroTitle: 'Edytuj {name}',
  removeMacroTitle: 'Usuń {name}',
  removeMacroQuestion: 'Usunąć to makro?',
  macroWillDisappear: '„{name}" zniknie z listy.',
  macroWillDisappearWithAttachments: '„{name}" zniknie razem z załącznikami ({count}).',
  removeMacroButton: 'Usuń makro',
  macroLabel: '{name}  ({count} zał.)',

  // Edytor makra
  content: 'Treść',
  bold: 'Pogrubienie',
  italic: 'Kursywa',
  strikethrough: 'Przekreślenie',
  bulletedList: 'Lista punktowana',
  numberedList: 'Numeracja',
  quote: 'Cytat',
  whatsappPreview: 'Podgląd w WhatsAppie',
  attachments: 'Załączniki',
  addAttachment: 'Dodaj załącznik',
  detach: 'Zdejmij',
  detachFile: 'Zdejmij {name}',
  storageHint: 'Plik trafia do magazynu aplikacji — oryginał przestaje być potrzebny.',
  saveMacro: 'Zapisz makro',
  none: 'brak',

  // Komunikaty na listwie
  messageNoAccount: 'Nie ma dokąd wstawić — najpierw dodaj konto i otwórz w nim rozmowę.',
  messageNoMacro: 'Tego makra już nie ma na liście.',
  messageEmptyMacro: 'To makro nie ma ani treści, ani załącznika — nie ma czego wstawić.',
  messageInsertFailed: 'Nie udało się wstawić makra.',
  messageInserted: 'Wstawiono „{macro}" do {account}. Enter należy do Ciebie.',
  messageTheAccount: 'konta',
  messageMissingAttachments: 'Brakuje załączników w magazynie: {list}. Tekst został wstawiony.',
  messageAttachmentFailed: 'Nie można dodać załącznika: {reason}',
  messageLoadAccountsFailed: 'Nie udało się wczytać kont: {reason}',

  // Teksty dla kodów zwracanych przez proces główny
  validationId: 'id musi pasować do acc-[a-z0-9-]+',
  validationName: 'nazwa jest wymagana',
  validationPlatform: 'nieznana platforma: {platform}',
  validationUrl: 'adres musi zaczynać się od https://',
  validationColor: 'kolor musi być w formacie #rrggbb',
  validationNoSuchAccount: 'nie ma takiego konta',
  validationNoSuchMacro: 'nie ma takiego makra',
  attachmentTooLarge: 'plik ma {mb} MB i przekracza limit {limitMb} MB',
  attachmentFailed: 'nie udało się skopiować pliku do magazynu aplikacji',

  // Proces główny: zasobnik, nakładka na ikonie, błędy ładowania
  trayShow: 'Pokaż',
  trayAutoStart: 'Uruchamiaj z Windows',
  trayQuit: 'Zakończ',
  trayUnread: {
    one: 'msg-hub — {n} nieprzeczytana',
    few: 'msg-hub — {n} nieprzeczytane',
    many: 'msg-hub — {n} nieprzeczytanych',
    other: 'msg-hub — {n} nieprzeczytanych',
  },
  overlayUnread: 'nieprzeczytane wiadomości',
  loadAccountFailed:
    'Nie udało się załadować konta {account} — błąd {code}: {description}. Jeśli sieć działa, ' +
    'a strona odmawia obsługi klienta, zaktualizuj Electrona (npm install electron@latest) — ' +
    'WhatsApp Web wymaga świeżej wersji Chromium.',
}
