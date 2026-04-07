import { z } from "zod";

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }
    return value;
  }, schema);

const optionalText = (max: number) =>
  emptyStringToUndefined(z.string().trim().min(1).max(max).optional());

export const exchangeStatusSchema = z.enum([
  "draft",
  "ready",
  "drawn",
  "archived",
]);

export const createExchangeInputSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: optionalText(2000),
  organizerName: optionalText(150),
  organizerParticipates: z.boolean().optional().default(true),
  eventDate: emptyStringToUndefined(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  budget: z.number().nonnegative().optional(),
  budgetCurrency: optionalText(3),
  noMutualAssignments: z.boolean().optional().default(false),
  adminPassword: z.string().min(10).max(256),
});

export const updateExchangeInputSchema = z.object({
  name: optionalText(150),
  description: optionalText(2000),
  organizerId: z.string().optional(),
  status: exchangeStatusSchema.optional(),
  eventDate: emptyStringToUndefined(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
  budget: z.number().nonnegative().optional(),
  budgetCurrency: optionalText(3),
  noMutualAssignments: z.boolean().optional(),
});

export const exchangeIdParamSchema = z.object({
  exchangeId: z.string().min(1),
});

export type CreateExchangeInput = z.infer<typeof createExchangeInputSchema>;
export type ExchangeIdParam = z.infer<typeof exchangeIdParamSchema>;
export type UpdateExchangeInput = z.infer<typeof updateExchangeInputSchema>;
