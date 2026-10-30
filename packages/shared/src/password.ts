import { z } from "zod";

// Validate the entered length before normalization (some Unicode letters expand).
export const adminPasswordSchema = z.string().min(8).max(256);
export const normalizeAdminPassword = (value: string): string =>
  value.toUpperCase();
