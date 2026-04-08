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

function isSuggestionsDeadlineAfterEventDate(
  eventDate?: string,
  suggestionsDeadlineAt?: string,
) {
  if (!eventDate || !suggestionsDeadlineAt) {
    return false;
  }

  const suggestionsDeadline = new Date(suggestionsDeadlineAt);
  const eventDateEnd = new Date(`${eventDate}T23:59:59.999Z`);

  if (
    Number.isNaN(suggestionsDeadline.getTime()) ||
    Number.isNaN(eventDateEnd.getTime())
  ) {
    return false;
  }

  return suggestionsDeadline.getTime() > eventDateEnd.getTime();
}

export const exchangeStatusSchema = z.enum([
  "draft",
  "ready",
  "drawn",
  "archived",
]);

export const createExchangeInputSchema = z
  .object({
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
    drawDeadlineAt: emptyStringToUndefined(
      z.string().datetime({ offset: true }).optional(),
    ),
    suggestionsDeadlineAt: emptyStringToUndefined(
      z.string().datetime({ offset: true }).optional(),
    ),
    budget: z.number().nonnegative().optional(),
    budgetCurrency: optionalText(3),
    minWishlistSuggestions: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .default(0),
    lockSuggestionsAfterDraw: z.boolean().optional().default(true),
    noMutualAssignments: z.boolean().optional().default(false),
    adminPassword: z.string().min(10).max(256),
  })
  .superRefine((value, ctx) => {
    if (
      isSuggestionsDeadlineAfterEventDate(
        value.eventDate,
        value.suggestionsDeadlineAt,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["suggestionsDeadlineAt"],
        message:
          "Suggestions deadline cannot be after the gift exchange moment.",
      });
    }
  });

export const updateExchangeInputSchema = z
  .object({
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
    drawDeadlineAt: emptyStringToUndefined(
      z.string().datetime({ offset: true }).optional(),
    ),
    suggestionsDeadlineAt: emptyStringToUndefined(
      z.string().datetime({ offset: true }).optional(),
    ),
    budget: z.number().nonnegative().optional(),
    budgetCurrency: optionalText(3),
    minWishlistSuggestions: z.number().int().min(0).max(100).optional(),
    lockSuggestionsAfterDraw: z.boolean().optional(),
    noMutualAssignments: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      isSuggestionsDeadlineAfterEventDate(
        value.eventDate,
        value.suggestionsDeadlineAt,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["suggestionsDeadlineAt"],
        message:
          "Suggestions deadline cannot be after the gift exchange moment.",
      });
    }
  });

export const exchangeIdParamSchema = z.object({
  exchangeId: z.string().min(1),
});

export type CreateExchangeInput = z.infer<typeof createExchangeInputSchema>;
export type ExchangeIdParam = z.infer<typeof exchangeIdParamSchema>;
export type UpdateExchangeInput = z.infer<typeof updateExchangeInputSchema>;
