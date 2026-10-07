export function safeUrl(value?: string, image = false): string | undefined {
  if (!value || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (image && import.meta.env.PROD && url.protocol !== 'https:') return undefined
    return value
  } catch {
    return undefined
  }
}
