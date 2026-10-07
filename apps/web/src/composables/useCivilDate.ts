export function formatCivilDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '-'
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString(undefined, { timeZone: 'UTC' })
}
