import { computed, ref } from 'vue'
export type FormValues = Record<string, unknown>
export type ConflictField = { key: string; initial: unknown; local: unknown; remote: unknown }
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  return value
}
export function equal(a: unknown, b: unknown) {
  return JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null))
}
export function compareVersions(
  base: FormValues,
  local: FormValues,
  remote: FormValues,
  locked: string[] = [],
) {
  const merged: FormValues = {}
  const fields: ConflictField[] = []
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    if (locked.includes(key)) merged[key] = remote[key]
    else if (equal(local[key], base[key])) merged[key] = remote[key]
    else if (equal(remote[key], base[key]) || equal(local[key], remote[key]))
      merged[key] = local[key]
    else {
      merged[key] = local[key]
      fields.push({ key, initial: base[key], local: local[key], remote: remote[key] })
    }
  }
  return { merged, fields }
}
export function useConflict() {
  const baseline = ref<FormValues>({})
  const remote = ref<FormValues | null>(null)
  const fields = ref<ConflictField[]>([])
  const merged = ref<FormValues>({})
  const choices = ref<Record<string, 'local' | 'remote'>>({})
  const ready = computed(() => fields.value.every((f) => choices.value[f.key]))
  function open(local: FormValues, current: FormValues, locked: string[] = []) {
    const compared = compareVersions(baseline.value, local, current, locked)
    remote.value = clone(current)
    merged.value = compared.merged
    fields.value = compared.fields
    choices.value = {}
  }
  function apply() {
    if (!remote.value || !ready.value) return null
    const result = { ...merged.value }
    for (const field of fields.value) result[field.key] = field[choices.value[field.key]!]
    baseline.value = clone(remote.value)
    remote.value = null
    return result
  }
  return { baseline, remote, fields, choices, ready, open, apply }
}
