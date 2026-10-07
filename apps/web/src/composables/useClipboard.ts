export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* Try the selectable fallback. */
  }
  const active = document.activeElement as HTMLElement | null
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.append(input)
  try {
    input.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    input.remove()
    active?.focus()
  }
}
