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

export const createParticipantInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: emptyStringToUndefined(z.email().optional()),
  wishlist: optionalText(4000),
  note: optionalText(2000),
})

export const participantIdParamSchema = z.object({
  participantId: z.string().min(1),
})

export type CreateParticipantInput = z.infer<typeof createParticipantInputSchema>
export type ParticipantIdParam = z.infer<typeof participantIdParamSchema>
