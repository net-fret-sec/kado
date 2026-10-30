import { effectiveExclusions, type ExclusionRule } from '@kado/shared'
export function groupExclusions(
  rules: Pick<ExclusionRule, 'giverParticipantId' | 'receiverParticipantId'>[],
  reciprocal = false,
) {
  rules = effectiveExclusions(rules, reciprocal)
  const pairs = new Set(rules.map((r) => `${r.giverParticipantId}:${r.receiverParticipantId}`))
  const seen = new Set<string>()
  const mutual: { a: string; b: string }[] = []
  const directional = new Map<string, string[]>()
  for (const r of rules) {
    const a = r.giverParticipantId,
      b = r.receiverParticipantId
    if (pairs.has(`${b}:${a}`)) {
      const key = [a, b].sort().join(':')
      if (!seen.has(key)) mutual.push({ a, b })
      seen.add(key)
    } else directional.set(a, [...(directional.get(a) ?? []), b])
  }
  return {
    mutual,
    directional: [...directional].map(([giver, receivers]) => ({ giver, receivers })),
  }
}
