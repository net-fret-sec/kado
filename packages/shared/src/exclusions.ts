type ExclusionPair = { giverParticipantId: string; receiverParticipantId: string };

/** Expand directional rules for modes where exclusions apply in both directions. */
export function effectiveExclusions(rules: readonly ExclusionPair[], reciprocal: boolean): ExclusionPair[] {
  const pairs = new Map<string, ExclusionPair>();
  for (const rule of rules) {
    pairs.set(JSON.stringify([rule.giverParticipantId, rule.receiverParticipantId]), rule);
    if (reciprocal) {
      const inverse = { giverParticipantId: rule.receiverParticipantId, receiverParticipantId: rule.giverParticipantId };
      pairs.set(JSON.stringify([inverse.giverParticipantId, inverse.receiverParticipantId]), inverse);
    }
  }
  return [...pairs.values()];
}
