interface ExclusionRuleRecord {
  id: string
  exchangeId: string
  giverParticipantId: string
  receiverParticipantId: string
  type: 'manual'
  createdAt: string
}

const exclusionRules = new Map<string, ExclusionRuleRecord>()

export const exclusionRuleRepository = {
  create(rule: ExclusionRuleRecord) {
    exclusionRules.set(rule.id, rule)
    return rule
  },

  findById(ruleId: string) {
    return exclusionRules.get(ruleId)
  },

  findByExchangeId(exchangeId: string) {
    return Array.from(exclusionRules.values()).filter((rule) => rule.exchangeId === exchangeId)
  },

  existsByExchangeAndPair(exchangeId: string, giverParticipantId: string, receiverParticipantId: string) {
    return Array.from(exclusionRules.values()).some(
      (rule) =>
        rule.exchangeId === exchangeId &&
        rule.giverParticipantId === giverParticipantId &&
        rule.receiverParticipantId === receiverParticipantId,
    )
  },

  deleteById(ruleId: string) {
    return exclusionRules.delete(ruleId)
  },

  deleteByExchangeId(exchangeId: string) {
    let deleted = 0

    for (const [id, rule] of exclusionRules.entries()) {
      if (rule.exchangeId === exchangeId) {
        exclusionRules.delete(id)
        deleted += 1
      }
    }

    return deleted
  },
}
