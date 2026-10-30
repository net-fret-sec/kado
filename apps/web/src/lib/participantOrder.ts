export function sortParticipants<T extends { name: string }>(
  people: readonly T[],
  locale = 'fr-CA',
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...people].sort((a, b) => collator.compare(a.name, b.name))
}
