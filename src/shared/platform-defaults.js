// The renderer cannot import src/main/accounts.js — it pulls in node:fs, and the renderer is
// sandboxed. Only the one fact the account form needs is mirrored here, and a test keeps the
// two in step so this file cannot quietly drift into a second opinion.
export const PLATFORM_DEFAULT_NOTIFICATIONS = {
  whatsapp: true,
  messenger: true,
  linkedin: false,
  facebook: false,
}
