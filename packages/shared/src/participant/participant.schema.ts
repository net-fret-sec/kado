// packages/shared/src/schemas/participant.schema.ts

import { z } from 'zod'
import { exchangeStatusSchema } from './exchange.schema'

export const participantStatusSchema = z.enum([
  'active',
  'removed',
])

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .optional()

export const participantDtoSchema = z.object({
  id: z.string().min(1),
  exchangeId: z.string().min(1),

  name: z.string().trim().min(1).max(150),
  email: z.email().optional(),

  wishlist: optionalTrimmedString(4000),
  note: optionalTrimmedString(2000),

  status: participantStatusSchema,

  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const createParticipantInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.email().optional(),
  wishlist: optionalTrimmedString(4000),
  note: optionalTrimmedString(2000),
})

export const updateParticipantInputSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    email: z.email().optional(),
    wishlist: optionalTrimmedString(4000),
    note: optionalTrimmedString(2000),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  })

export const createParticipantResultSchema = z.object({
  participant: participantDtoSchema,
  accessLink: z.string().url(),
})

export const regenerateParticipantAccessInputSchema = z.object({
  participantId: z.string().min(1),
  revokeExisting: z.boolean(),
})

export const regenerateParticipantAccessResultSchema = z.object({
  participantId: z.string().min(1),
  accessLink: z.string().url(),
})

export const participantAssignmentSchema = z.object({
  receiverName: z.string().trim().min(1).max(150),
  receiverWishlist: z.string().trim().min(1).max(4000).optional(),
  receiverNote: z.string().trim().min(1).max(2000).optional(),
})

export const participantSelfViewSchema = z.object({
  exchange: z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(2000).optional(),
    status: exchangeStatusSchema,
    eventDate: z.string().min(1).optional(),
    budget: z.number().nonnegative().optional(),
    budgetCurrency: z.string().trim().length(3).optional(),
  }),
  participant: z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(150),
    wishlist: z.string().trim().min(1).max(4000).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
  }),
  assignment: participantAssignmentSchema.optional(),
})

export type ParticipantStatusSchema = z.infer<typeof participantStatusSchema>
export type ParticipantDtoSchema = z.infer<typeof participantDtoSchema>
export type CreateParticipantInputSchema = z.infer<typeof createParticipantInputSchema>
export type UpdateParticipantInputSchema = z.infer<typeof updateParticipantInputSchema>
export type CreateParticipantResultSchema = z.infer<typeof createParticipantResultSchema>
export type RegenerateParticipantAccessInputSchema = z.infer<
  typeof regenerateParticipantAccessInputSchema
>
export type RegenerateParticipantAccessResultSchema = z.infer<
  typeof regenerateParticipantAccessResultSchema
>
export type ParticipantAssignmentSchema = z.infer<typeof participantAssignmentSchema>
export type ParticipantSelfViewSchema = z.infer<typeof participantSelfViewSchema>
