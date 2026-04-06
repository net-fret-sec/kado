import { z } from 'zod'

export const createExclusionRuleInputSchema = z.object({
  giverParticipantId: z.string().min(1),
  receiverParticipantId: z.string().min(1),
})

export const exchangeAndExclusionRuleIdParamSchema = z.object({
  exchangeId: z.string().min(1),
  ruleId: z.string().min(1),
})

export type CreateExclusionRuleInput = z.infer<typeof createExclusionRuleInputSchema>
export type ExchangeAndExclusionRuleIdParam = z.infer<typeof exchangeAndExclusionRuleIdParamSchema>
