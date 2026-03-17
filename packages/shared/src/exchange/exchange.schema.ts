// packages/shared/src/schemas/exchange.schema.ts

import { z } from 'zod'

export const exchangeStatusSchema = z.enum([
  'draft',
  'ready',
  'drawn',
  'archived',
])

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .optional()

const optionalIsoDateString = z
  .string()
  .datetime({ offset: true })
  .optional()

export const exchangeDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  description: optionalTrimmedString(2000),
  organizerName: optionalTrimmedString(150),

  status: exchangeStatusSchema,

  eventDate: z.string().min(1).optional(),
  budget: z.number().nonnegative().optional(),
  budgetCurrency: z.string().trim().length(3).optional(),

  drawAt: optionalIsoDateString,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const createExchangeInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: optionalTrimmedString(2000),
  organizerName: optionalTrimmedString(150),

  eventDate: z.string().min(1).optional(),
  budget: z.number().nonnegative().optional(),
  budgetCurrency: z.string().trim().length(3).optional(),

  adminPassword: z.string().min(10).max(256),
})

export const updateExchangeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: optionalTrimmedString(2000),
    organizerName: optionalTrimmedString(150),

    eventDate: z.string().min(1).optional(),
    budget: z.number().nonnegative().optional(),
    budgetCurrency: z.string().trim().length(3).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  })

export const createExchangeResultSchema = z.object({
  exchange: exchangeDtoSchema,
  adminSessionToken: z.string().min(1),
})

export const exchangeAdminViewSchema = z.object({
  exchange: exchangeDtoSchema,
  participantsCount: z.number().int().nonnegative(),
  exclusionRulesCount: z.number().int().nonnegative(),
  assignmentsExist: z.boolean(),
})

export type ExchangeStatusSchema = z.infer<typeof exchangeStatusSchema>
export type ExchangeDtoSchema = z.infer<typeof exchangeDtoSchema>
export type CreateExchangeInputSchema = z.infer<typeof createExchangeInputSchema>
export type UpdateExchangeInputSchema = z.infer<typeof updateExchangeInputSchema>
export type CreateExchangeResultSchema = z.infer<typeof createExchangeResultSchema>
export type ExchangeAdminViewSchema = z.infer<typeof exchangeAdminViewSchema>
