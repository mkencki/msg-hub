// Turning WhatsApp markers into PREVIEW html. This is not a WhatsApp renderer – it
// exists only so the operator can see how the text will sit in a chat.

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function decorate(fragment) {
  return fragment
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
}

export function toHtml(text) {
  const source = String(text ?? '')
  if (!source) return ''

  const lines = source.split('\n').map((line) => {
    const safe = escapeHtml(line)

    if (/^&gt;\s?/.test(safe)) {
      return `<blockquote>${decorate(safe.replace(/^&gt;\s?/, ''))}</blockquote>`
    }
    if (/^[-*]\s+/.test(safe)) {
      return `<li>${decorate(safe.replace(/^[-*]\s+/, ''))}</li>`
    }
    if (/^\d+\.\s+/.test(safe)) {
      return `<li>${decorate(safe.replace(/^\d+\.\s+/, ''))}</li>`
    }
    return `<p>${decorate(safe)}</p>`
  })

  return lines.join('')
}
