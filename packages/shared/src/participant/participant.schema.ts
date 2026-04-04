import { z } from 'zod'

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined
    }
    return value
  }, schema)

const optionalText = (max: number) =>
  emptyStringToUndefined(
    z.string().trim().min(1).max(max).optional()
  )

const optionalUrl = () =>
  emptyStringToUndefined(z.string().url().optional())

export const giftSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  imageUrl: optionalUrl(),
  icon: emptyStringToUndefined(z.string().trim().min(1).max(50).optional()),
  linkUrl: optionalUrl(),
})

const optionalGiftSuggestionList = emptyStringToUndefined(
  z.array(giftSuggestionSchema).min(1).max(100).optional(),
)

export const createParticipantInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: emptyStringToUndefined(z.email().optional()),
  wishlist: optionalGiftSuggestionList,
  note: optionalText(2000),
})

export const updateParticipantInputSchema = z.object({
  name: optionalText(150),
  email: emptyStringToUndefined(z.email().optional()),
  wishlist: optionalGiftSuggestionList,
  note: optionalText(2000),
})

export const regenerateParticipantAccessInputSchema = z.object({
  revokeExisting: z.boolean().optional().default(true),
})

export const participantIdParamSchema = z.object({
  participantId: z.string().min(1),
})

export const exchangeAndParticipantIdParamSchema = z.object({
  exchangeId: z.string().min(1),
  participantId: z.string().min(1),
})

export type CreateParticipantInput = z.infer<typeof createParticipantInputSchema>
export type ParticipantIdParam = z.infer<typeof participantIdParamSchema>
export type ExchangeAndParticipantIdParam = z.infer<typeof exchangeAndParticipantIdParamSchema>
export type UpdateParticipantInput = z.infer<typeof updateParticipantInputSchema>
export type RegenerateParticipantAccessInput = z.infer<typeof regenerateParticipantAccessInputSchema>
export type GiftSuggestion = z.infer<typeof giftSuggestionSchema>
