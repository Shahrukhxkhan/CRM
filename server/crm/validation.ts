import { z } from "zod";
import { ACTIVITY_TYPES, PIPELINE_STAGES, QUOTE_STATUSES } from "./constants";

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform(value => value || undefined);

const optionalDate = z
  .union([z.coerce.date(), z.null()])
  .optional()
  .transform(value => value ?? undefined);

export const recordIdSchema = z.object({ id: z.number().int().positive() });

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "Company name is required").max(255),
  website: optionalText(2048).refine(value => !value || z.url().safeParse(value).success, "Enter a valid URL"),
  phone: optionalText(64),
  address: optionalText(5_000),
  notes: optionalText(10_000),
});

export const contactInputSchema = z.object({
  companyId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, "Contact name is required").max(255),
  email: optionalText(320).refine(value => !value || z.email().safeParse(value).success, "Enter a valid email address"),
  phone: optionalText(64),
  source: optionalText(120),
  estimatedValue: z.coerce.number().nonnegative("Estimated value cannot be negative").finite().nullable().optional(),
  stage: z.enum(PIPELINE_STAGES).optional(),
  notes: optionalText(10_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const activityInputSchema = z.object({
  contactId: z.number().int().positive(),
  type: z.enum(ACTIVITY_TYPES),
  body: z.string().trim().min(1, "Activity details are required").max(10_000),
  occurredAt: z.coerce.date(),
});

export const followUpInputSchema = z.object({
  contactId: z.number().int().positive(),
  title: z.string().trim().min(1, "Follow-up title is required").max(255),
  description: optionalText(10_000),
  dueAt: z.coerce.date(),
});

export const quoteItemInputSchema = z.object({
  description: z.string().trim().min(1, "Line-item description is required").max(10_000),
  quantity: z.coerce.number().positive("Quantity must be greater than zero").finite(),
  unitPrice: z.coerce.number().nonnegative("Unit price cannot be negative").finite(),
});

export const quoteInputSchema = z.object({
  contactId: z.number().int().positive(),
  title: z.string().trim().min(1, "Quote title is required").max(255),
  status: z.enum(QUOTE_STATUSES).optional(),
  expiresAt: optionalDate,
  notes: optionalText(10_000),
  items: z.array(quoteItemInputSchema).min(1, "Add at least one valid line item").max(100),
});
