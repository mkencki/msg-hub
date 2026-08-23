// Zamiana znacznikow WhatsApp na HTML PODGLADU. Nie jest to renderer WhatsAppa —
// sluzy wylacznie temu, zeby operator widzial, jak tekst ulozy sie w czacie.

function uciekniejHtml(tekst) {
  return String(tekst)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function ozdob(fragment) {
  return fragment
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
}

export function naHtml(tekst) {
  const zrodlo = String(tekst ?? '')
  if (!zrodlo) return ''

  const linie = zrodlo.split('\n').map((linia) => {
    const bezpieczna = uciekniejHtml(linia)

    if (/^&gt;\s?/.test(bezpieczna)) {
      return `<blockquote>${ozdob(bezpieczna.replace(/^&gt;\s?/, ''))}</blockquote>`
    }
    if (/^[-*]\s+/.test(bezpieczna)) {
      return `<li>${ozdob(bezpieczna.replace(/^[-*]\s+/, ''))}</li>`
    }
    if (/^\d+\.\s+/.test(bezpieczna)) {
      return `<li>${ozdob(bezpieczna.replace(/^\d+\.\s+/, ''))}</li>`
    }
    return `<p>${ozdob(bezpieczna)}</p>`
  })

  return linie.join('')
}
