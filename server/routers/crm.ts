import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  activities,
  companies,
  contactAttachments,
  contactCustomFieldValues,
  contactImportChanges,
  contactImportRows,
  contactImports,
  contactListMembers,
  contactLists,
  contacts,
  customFieldDefinitions,
  dealStageHistory,
  deals,
  followUps,
  generatedExports,
  lostReasons,
  pipelineStages,
  pipelines,
  quotes,
  savedContactSearches,
  scheduledExports,
  taskComments,
  taskTemplates,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGet, storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const recurrenceSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
const fieldTypeSchema = z.enum(["text", "number", "date", "select", "multiselect", "boolean", "url"]);
const contactInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(160).optional().or(z.literal("")),
  companyId: z.number().int().positive().nullable().optional(),
  relationshipStage: z.string().trim().min(1).max(64).default("Lead"),
});

const importRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  firstName: z.string().trim(),
  lastName: z.string().trim(),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  jobTitle: z.string().trim().optional().default(""),
  relationshipStage: z.string().trim().optional().default("Lead"),
});

type ImportRow = z.infer<typeof importRowSchema>;

export function normalizeEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function assertJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label} must be valid JSON.` });
  }
}

function escapeCsv(value: unknown) {
  const normalized = String(value ?? "");
  return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
  return db;
}

async function requireOwnedContact(ownerId: number, contactId: number) {
  const db = await requireDb();
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId))).limit(1);
  if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
  return contact;
}

async function requireOwnedCompany(ownerId: number, companyId: number | null | undefined) {
  if (!companyId) return;
  const db = await requireDb();
  const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.ownerId, ownerId))).limit(1);
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
}

const defaultStages = [
  { name: "Prospecting", position: 10, color: "#64748b", probability: "10.00", stageKind: "open" as const },
  { name: "Qualified", position: 20, color: "#2563eb", probability: "25.00", stageKind: "open" as const },
  { name: "Proposal", position: 30, color: "#8b5cf6", probability: "50.00", stageKind: "open" as const },
  { name: "Negotiation", position: 40, color: "#f59e0b", probability: "75.00", stageKind: "open" as const },
  { name: "Won", position: 50, color: "#16a34a", probability: "100.00", stageKind: "won" as const },
  { name: "Lost", position: 60, color: "#dc2626", probability: "0.00", stageKind: "lost" as const },
];

async function ensureDefaultPipeline(ownerId: number) {
  const db = await requireDb();
  const [existing] = await db.select().from(pipelines).where(and(eq(pipelines.ownerId, ownerId), eq(pipelines.isArchived, false))).orderBy(desc(pipelines.isDefault)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(pipelines).values({
    ownerId,
    name: "Sales Pipeline",
    description: "Default solo-workspace opportunity pipeline",
    isDefault: true,
    isArchived: false,
  }).$returningId();
  await db.insert(pipelineStages).values(defaultStages.map(stage => ({ ...stage, ownerId, pipelineId: created.id })));
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, created.id)).limit(1);
  return pipeline!;
}

async function calculateImportPreview(ownerId: number, rows: ImportRow[], duplicateStrategy: "create" | "update" | "skip") {
  const emails = Array.from(new Set(rows.map(row => normalizeEmail(row.email)).filter((email): email is string => Boolean(email))));
  const db = await requireDb();
  const existing = emails.length
    ? await db.select().from(contacts).where(and(eq(contacts.ownerId, ownerId), inArray(contacts.normalizedEmail, emails), isNull(contacts.archivedAt)))
    : [];
  const existingByEmail = new Map(existing.filter(contact => contact.normalizedEmail).map(contact => [contact.normalizedEmail!, contact]));
  const seenEmails = new Set<string>();

  return rows.map(row => {
    const normalizedEmail = normalizeEmail(row.email);
    if (!row.firstName || !row.lastName) {
      return { ...row, normalizedEmail, action: "error" as const, contactId: undefined, errorMessage: "First and last name are required." };
    }
    if (row.email && !z.string().email().safeParse(row.email).success) {
      return { ...row, normalizedEmail, action: "error" as const, contactId: undefined, errorMessage: "Email address is invalid." };
    }
    if (normalizedEmail && seenEmails.has(normalizedEmail)) {
      return { ...row, normalizedEmail, action: "error" as const, contactId: undefined, errorMessage: "Duplicate email appears more than once in this CSV." };
    }
    if (normalizedEmail) seenEmails.add(normalizedEmail);
    const match = normalizedEmail ? existingByEmail.get(normalizedEmail) : undefined;
    if (!match) return { ...row, normalizedEmail, action: "create" as const, contactId: undefined, errorMessage: undefined };
    if (duplicateStrategy === "update") return { ...row, normalizedEmail, action: "update" as const, contactId: match.id, errorMessage: undefined };
    if (duplicateStrategy === "skip") return { ...row, normalizedEmail, action: "skip" as const, contactId: match.id, errorMessage: undefined };
    return { ...row, normalizedEmail, action: "create" as const, contactId: undefined, errorMessage: undefined };
  });
}

export function nextDueDate(dueAt: Date | null, recurrenceRule: "DAILY" | "WEEKLY" | "MONTHLY") {
  const next = new Date(dueAt ?? new Date());
  if (recurrenceRule === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  if (recurrenceRule === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  if (recurrenceRule === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export const crmRouter = router({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    await ensureDefaultPipeline(ctx.user.id);
    const [allContacts] = await db.select({ count: contacts.id }).from(contacts).where(and(eq(contacts.ownerId, ctx.user.id), isNull(contacts.archivedAt)));
    const openTasks = await db.select().from(followUps).where(and(eq(followUps.ownerId, ctx.user.id), isNull(followUps.completedAt), isNull(followUps.archivedAt)));
    const ownerDeals = await db.select({ deal: deals, stage: pipelineStages }).from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).where(eq(deals.ownerId, ctx.user.id));
    const weightedForecast = ownerDeals.filter(item => item.stage.stageKind === "open").reduce((sum, item) => sum + Number(item.deal.amount) * (Number(item.stage.probability) / 100), 0);
    return {
      contacts: allContacts?.count ?? 0,
      openTasks: openTasks.length,
      openDeals: ownerDeals.filter(item => item.stage.stageKind === "open").length,
      weightedForecast,
    };
  }),

  companies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(companies).where(eq(companies.ownerId, ctx.user.id)).orderBy(asc(companies.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(255), website: z.string().trim().max(512).optional(), phone: z.string().trim().max(64).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [created] = await db.insert(companies).values({ ownerId: ctx.user.id, name: input.name, website: input.website || null, phone: input.phone || null }).$returningId();
      return { id: created.id };
    }),
  }),

  contacts: router({
    list: protectedProcedure.input(z.object({ includeArchived: z.boolean().default(false), search: z.string().trim().max(160).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const filters = [eq(contacts.ownerId, ctx.user.id), isNull(contacts.mergedIntoContactId)];
      if (!input?.includeArchived) filters.push(isNull(contacts.archivedAt));
      if (input?.search) {
        const term = `%${input.search}%`;
        filters.push(or(like(contacts.firstName, term), like(contacts.lastName, term), like(contacts.email, term))!);
      }
      return db.select({ contact: contacts, companyName: companies.name }).from(contacts).leftJoin(companies, eq(contacts.companyId, companies.id)).where(and(...filters)).orderBy(desc(contacts.updatedAt));
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const contact = await requireOwnedContact(ctx.user.id, input.id);
      const db = await requireDb();
      const [company] = contact.companyId ? await db.select().from(companies).where(and(eq(companies.id, contact.companyId), eq(companies.ownerId, ctx.user.id))).limit(1) : [];
      const values = await db.select({ value: contactCustomFieldValues, definition: customFieldDefinitions }).from(contactCustomFieldValues).innerJoin(customFieldDefinitions, eq(contactCustomFieldValues.definitionId, customFieldDefinitions.id)).where(and(eq(contactCustomFieldValues.contactId, contact.id), eq(contactCustomFieldValues.ownerId, ctx.user.id))).orderBy(asc(customFieldDefinitions.position));
      const attachments = await db.select().from(contactAttachments).where(and(eq(contactAttachments.contactId, contact.id), eq(contactAttachments.ownerId, ctx.user.id))).orderBy(desc(contactAttachments.createdAt));
      const timeline = await db.select({ activity: activities, dealTitle: deals.title }).from(activities).leftJoin(deals, eq(activities.dealId, deals.id)).where(and(eq(activities.contactId, contact.id), eq(activities.ownerId, ctx.user.id))).orderBy(desc(activities.occurredAt));
      const linkedDeals = await db.select({ deal: deals, stage: pipelineStages }).from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).where(and(eq(deals.contactId, contact.id), eq(deals.ownerId, ctx.user.id))).orderBy(desc(deals.updatedAt));
      return { contact, company: company ?? null, values, attachments: attachments.map(item => ({ ...item, url: `/manus-storage/${item.storageKey}` })), timeline, linkedDeals };
    }),
    create: protectedProcedure.input(contactInput).mutation(async ({ ctx, input }) => {
      await requireOwnedCompany(ctx.user.id, input.companyId);
      const db = await requireDb();
      const normalizedEmail = normalizeEmail(input.email);
      const duplicates = normalizedEmail ? await db.select().from(contacts).where(and(eq(contacts.ownerId, ctx.user.id), eq(contacts.normalizedEmail, normalizedEmail), isNull(contacts.archivedAt))).limit(5) : [];
      const [created] = await db.insert(contacts).values({
        ownerId: ctx.user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        normalizedEmail,
        phone: input.phone || null,
        jobTitle: input.jobTitle || null,
        companyId: input.companyId ?? null,
        relationshipStage: input.relationshipStage,
      }).$returningId();
      return { id: created.id, duplicates: duplicates.map(contact => ({ id: contact.id, name: `${contact.firstName} ${contact.lastName}`, email: contact.email })) };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), data: contactInput.partial() })).mutation(async ({ ctx, input }) => {
      const current = await requireOwnedContact(ctx.user.id, input.id);
      await requireOwnedCompany(ctx.user.id, input.data.companyId);
      const db = await requireDb();
      const nextEmail = input.data.email === undefined ? current.email : input.data.email || null;
      await db.update(contacts).set({
        ...input.data,
        email: nextEmail,
        normalizedEmail: normalizeEmail(nextEmail),
        phone: input.data.phone === undefined ? undefined : input.data.phone || null,
        jobTitle: input.data.jobTitle === undefined ? undefined : input.data.jobTitle || null,
      }).where(and(eq(contacts.id, input.id), eq(contacts.ownerId, ctx.user.id)));
      return { success: true };
    }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOwnedContact(ctx.user.id, input.id);
      const db = await requireDb();
      await db.update(contacts).set({ archivedAt: new Date() }).where(and(eq(contacts.id, input.id), eq(contacts.ownerId, ctx.user.id)));
      return { success: true };
    }),
    restore: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOwnedContact(ctx.user.id, input.id);
      const db = await requireDb();
      await db.update(contacts).set({ archivedAt: null, mergedIntoContactId: null }).where(and(eq(contacts.id, input.id), eq(contacts.ownerId, ctx.user.id)));
      return { success: true };
    }),
    merge: protectedProcedure.input(z.object({ sourceId: z.number().int().positive(), survivorId: z.number().int().positive() }).refine(input => input.sourceId !== input.survivorId, { message: "Choose two different contacts." })).mutation(async ({ ctx, input }) => {
      const source = await requireOwnedContact(ctx.user.id, input.sourceId);
      const survivor = await requireOwnedContact(ctx.user.id, input.survivorId);
      if (survivor.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "The survivor must be an active contact." });
      const db = await requireDb();
      await db.transaction(async tx => {
        await tx.update(activities).set({ contactId: survivor.id }).where(and(eq(activities.contactId, source.id), eq(activities.ownerId, ctx.user.id)));
        await tx.update(followUps).set({ contactId: survivor.id }).where(and(eq(followUps.contactId, source.id), eq(followUps.ownerId, ctx.user.id)));
        await tx.update(quotes).set({ contactId: survivor.id }).where(and(eq(quotes.contactId, source.id), eq(quotes.ownerId, ctx.user.id)));
        await tx.update(contactAttachments).set({ contactId: survivor.id }).where(and(eq(contactAttachments.contactId, source.id), eq(contactAttachments.ownerId, ctx.user.id)));
        await tx.update(deals).set({ contactId: survivor.id }).where(and(eq(deals.contactId, source.id), eq(deals.ownerId, ctx.user.id)));

        const sourceValues = await tx.select().from(contactCustomFieldValues).where(and(eq(contactCustomFieldValues.contactId, source.id), eq(contactCustomFieldValues.ownerId, ctx.user.id)));
        for (const value of sourceValues) {
          const [survivorValue] = await tx.select().from(contactCustomFieldValues).where(and(eq(contactCustomFieldValues.contactId, survivor.id), eq(contactCustomFieldValues.definitionId, value.definitionId))).limit(1);
          if (survivorValue) await tx.delete(contactCustomFieldValues).where(eq(contactCustomFieldValues.id, value.id));
          else await tx.update(contactCustomFieldValues).set({ contactId: survivor.id }).where(eq(contactCustomFieldValues.id, value.id));
        }

        const memberships = await tx.select().from(contactListMembers).where(eq(contactListMembers.contactId, source.id));
        for (const membership of memberships) {
          const [existingMember] = await tx.select().from(contactListMembers).where(and(eq(contactListMembers.listId, membership.listId), eq(contactListMembers.contactId, survivor.id))).limit(1);
          if (existingMember) await tx.delete(contactListMembers).where(eq(contactListMembers.id, membership.id));
          else await tx.update(contactListMembers).set({ contactId: survivor.id }).where(eq(contactListMembers.id, membership.id));
        }
        await tx.update(contacts).set({ archivedAt: new Date(), mergedIntoContactId: survivor.id }).where(and(eq(contacts.id, source.id), eq(contacts.ownerId, ctx.user.id)));
      });
      return { success: true, survivorId: survivor.id };
    }),
    customFields: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = await requireDb();
        return db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.ownerId, ctx.user.id)).orderBy(asc(customFieldDefinitions.position));
      }),
      create: protectedProcedure.input(z.object({ label: z.string().trim().min(1).max(120), fieldKey: z.string().trim().regex(/^[a-z][a-z0-9_]*$/).max(120), fieldType: fieldTypeSchema, options: z.array(z.string().trim().min(1).max(80)).max(50).optional(), isRequired: z.boolean().default(false), position: z.number().int().min(0).default(0) }).superRefine((input, issue) => {
        if (["select", "multiselect"].includes(input.fieldType) && !input.options?.length) issue.addIssue({ code: "custom", message: "Select fields require at least one option." });
      })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [created] = await db.insert(customFieldDefinitions).values({ ownerId: ctx.user.id, label: input.label, fieldKey: input.fieldKey, fieldType: input.fieldType, optionsJson: input.options ? JSON.stringify(input.options) : null, isRequired: input.isRequired, position: input.position }).$returningId();
        return { id: created.id };
      }),
      setValue: protectedProcedure.input(z.object({ contactId: z.number().int().positive(), definitionId: z.number().int().positive(), value: z.unknown() })).mutation(async ({ ctx, input }) => {
        await requireOwnedContact(ctx.user.id, input.contactId);
        const db = await requireDb();
        const [definition] = await db.select().from(customFieldDefinitions).where(and(eq(customFieldDefinitions.id, input.definitionId), eq(customFieldDefinitions.ownerId, ctx.user.id), eq(customFieldDefinitions.isActive, true))).limit(1);
        if (!definition) throw new TRPCError({ code: "NOT_FOUND", message: "Custom field not found." });
        const serialized = JSON.stringify(input.value);
        const [existing] = await db.select().from(contactCustomFieldValues).where(and(eq(contactCustomFieldValues.contactId, input.contactId), eq(contactCustomFieldValues.definitionId, input.definitionId))).limit(1);
        if (existing) await db.update(contactCustomFieldValues).set({ valueJson: serialized }).where(eq(contactCustomFieldValues.id, existing.id));
        else await db.insert(contactCustomFieldValues).values({ ownerId: ctx.user.id, contactId: input.contactId, definitionId: input.definitionId, valueJson: serialized });
        return { success: true };
      }),
      delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [definition] = await db.select().from(customFieldDefinitions).where(and(eq(customFieldDefinitions.id, input.id), eq(customFieldDefinitions.ownerId, ctx.user.id))).limit(1);
        if (!definition) throw new TRPCError({ code: "NOT_FOUND", message: "Custom field not found." });
        await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, input.id));
        return { success: true };
      }),
    }),
    attachments: router({
      upload: protectedProcedure.input(z.object({ contactId: z.number().int().positive(), filename: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(160), base64: z.string().min(1).max(13_500_000) })).mutation(async ({ ctx, input }) => {
        await requireOwnedContact(ctx.user.id, input.contactId);
        const bytes = Buffer.from(input.base64, "base64");
        if (!bytes.length || bytes.length > 10_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachments must be between 1 byte and 10 MB." });
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(`crm/${ctx.user.id}/contacts/${input.contactId}/${safeName}`, bytes, input.mimeType);
        const db = await requireDb();
        const [created] = await db.insert(contactAttachments).values({ ownerId: ctx.user.id, contactId: input.contactId, storageKey: stored.key, filename: input.filename, mimeType: input.mimeType, sizeBytes: bytes.length }).$returningId();
        return { id: created.id, url: stored.url };
      }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [attachment] = await db.select().from(contactAttachments).where(and(eq(contactAttachments.id, input.id), eq(contactAttachments.ownerId, ctx.user.id))).limit(1);
        if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found." });
        await db.delete(contactAttachments).where(eq(contactAttachments.id, attachment.id));
        return { success: true };
      }),
    }),
  }),

  lists: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(contactLists).where(eq(contactLists.ownerId, ctx.user.id)).orderBy(asc(contactLists.name));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [created] = await db.insert(contactLists).values({ ownerId: ctx.user.id, name: input.name, description: input.description || null }).$returningId();
      return { id: created.id };
    }),
    addMember: protectedProcedure.input(z.object({ listId: z.number().int().positive(), contactId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireOwnedContact(ctx.user.id, input.contactId);
      const db = await requireDb();
      const [list] = await db.select().from(contactLists).where(and(eq(contactLists.id, input.listId), eq(contactLists.ownerId, ctx.user.id))).limit(1);
      if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Contact list not found." });
      const [existing] = await db.select().from(contactListMembers).where(and(eq(contactListMembers.listId, input.listId), eq(contactListMembers.contactId, input.contactId))).limit(1);
      if (!existing) await db.insert(contactListMembers).values({ listId: input.listId, contactId: input.contactId });
      return { success: true };
    }),
    members: protectedProcedure.input(z.object({ listId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [list] = await db.select().from(contactLists).where(and(eq(contactLists.id, input.listId), eq(contactLists.ownerId, ctx.user.id))).limit(1);
      if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Contact list not found." });
      return db.select({ contact: contacts }).from(contactListMembers).innerJoin(contacts, eq(contactListMembers.contactId, contacts.id)).where(eq(contactListMembers.listId, input.listId));
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.delete(contactLists).where(and(eq(contactLists.id, input.id), eq(contactLists.ownerId, ctx.user.id)));
      return { success: true };
    }),
    searches: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = await requireDb();
        return db.select().from(savedContactSearches).where(eq(savedContactSearches.ownerId, ctx.user.id)).orderBy(desc(savedContactSearches.isPinned), asc(savedContactSearches.name));
      }),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), criteriaJson: z.string().trim().min(2).max(10_000), isPinned: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
        assertJson(input.criteriaJson, "Search criteria");
        const db = await requireDb();
        const [created] = await db.insert(savedContactSearches).values({ ownerId: ctx.user.id, name: input.name, criteriaJson: input.criteriaJson, isPinned: input.isPinned }).$returningId();
        return { id: created.id };
      }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await db.delete(savedContactSearches).where(and(eq(savedContactSearches.id, input.id), eq(savedContactSearches.ownerId, ctx.user.id)));
        return { success: true };
      }),
    }),
  }),

  imports: router({
    preview: protectedProcedure.input(z.object({ duplicateStrategy: z.enum(["create", "update", "skip"]), rows: z.array(importRowSchema).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const rows = await calculateImportPreview(ctx.user.id, input.rows, input.duplicateStrategy);
      return { rows, hasErrors: rows.some(row => row.action === "error") };
    }),
    commit: protectedProcedure.input(z.object({ filename: z.string().trim().min(1).max(255), columnMappingJson: z.string().trim().min(2).max(10_000), duplicateStrategy: z.enum(["create", "update", "skip"]), rows: z.array(importRowSchema).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      assertJson(input.columnMappingJson, "Column mapping");
      const preview = await calculateImportPreview(ctx.user.id, input.rows, input.duplicateStrategy);
      const errors = preview.filter(row => row.action === "error");
      if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Import contains invalid rows.", cause: errors });
      const db = await requireDb();
      const [header] = await db.insert(contactImports).values({ ownerId: ctx.user.id, filename: input.filename, columnMappingJson: input.columnMappingJson, duplicateStrategy: input.duplicateStrategy, status: "preview" }).$returningId();
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      await db.transaction(async tx => {
        for (const row of preview) {
          const sourceJson = JSON.stringify(row);
          if (row.action === "skip") {
            skippedCount += 1;
            await tx.insert(contactImportRows).values({ importId: header.id, rowNumber: row.rowNumber, action: "skip", sourceJson, contactId: row.contactId ?? null });
            continue;
          }
          if (row.action === "create") {
            const [created] = await tx.insert(contacts).values({ ownerId: ctx.user.id, firstName: row.firstName, lastName: row.lastName, email: row.email || null, normalizedEmail: row.normalizedEmail, phone: row.phone || null, jobTitle: row.jobTitle || null, relationshipStage: row.relationshipStage || "Lead" }).$returningId();
            createdCount += 1;
            await tx.insert(contactImportRows).values({ importId: header.id, rowNumber: row.rowNumber, action: "create", sourceJson, contactId: created.id });
            await tx.insert(contactImportChanges).values({ importId: header.id, contactId: created.id, action: "create", beforeJson: null, afterJson: JSON.stringify(row) });
            continue;
          }
          const [before] = await tx.select().from(contacts).where(and(eq(contacts.id, row.contactId!), eq(contacts.ownerId, ctx.user.id))).limit(1);
          if (!before) throw new TRPCError({ code: "NOT_FOUND", message: `Contact matched by row ${row.rowNumber} no longer exists.` });
          await tx.update(contacts).set({ firstName: row.firstName, lastName: row.lastName, email: row.email || null, normalizedEmail: row.normalizedEmail, phone: row.phone || null, jobTitle: row.jobTitle || null, relationshipStage: row.relationshipStage || "Lead" }).where(eq(contacts.id, before.id));
          updatedCount += 1;
          await tx.insert(contactImportRows).values({ importId: header.id, rowNumber: row.rowNumber, action: "update", sourceJson, contactId: before.id });
          await tx.insert(contactImportChanges).values({ importId: header.id, contactId: before.id, action: "update", beforeJson: JSON.stringify(before), afterJson: JSON.stringify(row) });
        }
        await tx.update(contactImports).set({ status: "completed", createdCount, updatedCount, skippedCount, failedCount: 0 }).where(eq(contactImports.id, header.id));
      });
      return { id: header.id, createdCount, updatedCount, skippedCount };
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(contactImports).where(eq(contactImports.ownerId, ctx.user.id)).orderBy(desc(contactImports.createdAt));
    }),
    review: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [header] = await db.select().from(contactImports).where(and(eq(contactImports.id, input.id), eq(contactImports.ownerId, ctx.user.id))).limit(1);
      if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "Import not found." });
      const rows = await db.select().from(contactImportRows).where(eq(contactImportRows.importId, input.id)).orderBy(asc(contactImportRows.rowNumber));
      return { header, rows };
    }),
    undo: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [header] = await db.select().from(contactImports).where(and(eq(contactImports.id, input.id), eq(contactImports.ownerId, ctx.user.id))).limit(1);
      if (!header || header.status !== "completed" || header.revertedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a completed, unreverted import can be undone." });
      const changes = await db.select().from(contactImportChanges).where(eq(contactImportChanges.importId, header.id));
      await db.transaction(async tx => {
        for (const change of changes) {
          if (change.action === "create") {
            await tx.update(contacts).set({ archivedAt: new Date() }).where(and(eq(contacts.id, change.contactId), eq(contacts.ownerId, ctx.user.id)));
            continue;
          }
          const before = assertJson(change.beforeJson ?? "{}", "Import change snapshot") as Record<string, unknown>;
          await tx.update(contacts).set({
            firstName: String(before.firstName ?? ""),
            lastName: String(before.lastName ?? ""),
            email: before.email ? String(before.email) : null,
            normalizedEmail: before.normalizedEmail ? String(before.normalizedEmail) : null,
            phone: before.phone ? String(before.phone) : null,
            jobTitle: before.jobTitle ? String(before.jobTitle) : null,
            companyId: typeof before.companyId === "number" ? before.companyId : null,
            relationshipStage: String(before.relationshipStage ?? "Lead"),
            archivedAt: before.archivedAt ? new Date(String(before.archivedAt)) : null,
            mergedIntoContactId: typeof before.mergedIntoContactId === "number" ? before.mergedIntoContactId : null,
          }).where(and(eq(contacts.id, change.contactId), eq(contacts.ownerId, ctx.user.id)));
        }
        await tx.update(contactImports).set({ status: "reverted", revertedAt: new Date() }).where(eq(contactImports.id, header.id));
      });
      return { success: true };
    }),
  }),

  exports: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const configurations = await db.select().from(scheduledExports).where(eq(scheduledExports.ownerId, ctx.user.id)).orderBy(desc(scheduledExports.createdAt));
      const files = await db.select().from(generatedExports).where(eq(generatedExports.ownerId, ctx.user.id)).orderBy(desc(generatedExports.createdAt));
      return { configurations, files: files.map(file => ({ ...file, url: `/manus-storage/${file.storageKey}` })) };
    }),
    createConfiguration: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), criteriaJson: z.string().trim().min(2).max(10_000), cronExpression: z.string().trim().min(9).max(128) })).mutation(async ({ ctx, input }) => {
      assertJson(input.criteriaJson, "Export criteria");
      const db = await requireDb();
      const [created] = await db.insert(scheduledExports).values({ ownerId: ctx.user.id, name: input.name, criteriaJson: input.criteriaJson, cronExpression: input.cronExpression, isActive: false }).$returningId();
      return { id: created.id, note: "Saved as inactive until deployed scheduling is explicitly enabled." };
    }),
    generateNow: protectedProcedure.input(z.object({ scheduledExportId: z.number().int().positive().optional(), includeArchived: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      if (input.scheduledExportId) {
        const [configuration] = await db.select().from(scheduledExports).where(and(eq(scheduledExports.id, input.scheduledExportId), eq(scheduledExports.ownerId, ctx.user.id))).limit(1);
        if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Export configuration not found." });
      }
      const conditions = [eq(contacts.ownerId, ctx.user.id), isNull(contacts.mergedIntoContactId)];
      if (!input.includeArchived) conditions.push(isNull(contacts.archivedAt));
      const rows = await db.select().from(contacts).where(and(...conditions)).orderBy(asc(contacts.lastName), asc(contacts.firstName));
      const csv = ["firstName,lastName,email,phone,jobTitle,relationshipStage", ...rows.map(row => [row.firstName, row.lastName, row.email, row.phone, row.jobTitle, row.relationshipStage].map(escapeCsv).join(","))].join("\n");
      const filename = `soloflow-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
      const stored = await storagePut(`crm/${ctx.user.id}/exports/${filename}`, csv, "text/csv");
      const [created] = await db.insert(generatedExports).values({ ownerId: ctx.user.id, scheduledExportId: input.scheduledExportId ?? null, storageKey: stored.key, filename }).$returningId();
      return { id: created.id, url: stored.url, filename };
    }),
  }),

  tasks: router({
    list: protectedProcedure.input(z.object({ includeCompleted: z.boolean().default(false) }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const filters = [eq(followUps.ownerId, ctx.user.id), isNull(followUps.archivedAt)];
      if (!input?.includeCompleted) filters.push(isNull(followUps.completedAt));
      return db.select({ task: followUps, contact: contacts }).from(followUps).leftJoin(contacts, eq(followUps.contactId, contacts.id)).where(and(...filters)).orderBy(asc(followUps.dueAt));
    }),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(255), description: z.string().trim().max(5000).optional(), contactId: z.number().int().positive().nullable().optional(), dueAt: z.date().nullable().optional(), priority: prioritySchema.default("medium"), recurrenceRule: recurrenceSchema.nullable().optional(), reminderAt: z.date().nullable().optional(), escalationAt: z.date().nullable().optional(), templateId: z.number().int().positive().nullable().optional() })).mutation(async ({ ctx, input }) => {
      if (input.contactId) await requireOwnedContact(ctx.user.id, input.contactId);
      const db = await requireDb();
      if (input.templateId) {
        const [template] = await db.select().from(taskTemplates).where(and(eq(taskTemplates.id, input.templateId), eq(taskTemplates.ownerId, ctx.user.id))).limit(1);
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Task template not found." });
      }
      const [created] = await db.insert(followUps).values({ ownerId: ctx.user.id, title: input.title, description: input.description || null, contactId: input.contactId ?? null, dueAt: input.dueAt ?? null, priority: input.priority, recurrenceRule: input.recurrenceRule ?? null, reminderAt: input.reminderAt ?? null, escalationAt: input.escalationAt ?? null, templateId: input.templateId ?? null }).$returningId();
      return { id: created.id };
    }),
    complete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [task] = await db.select().from(followUps).where(and(eq(followUps.id, input.id), eq(followUps.ownerId, ctx.user.id))).limit(1);
      if (!task || task.completedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Active task not found." });
      const completedAt = new Date();
      await db.transaction(async tx => {
        const recurrence = task.recurrenceRule as z.infer<typeof recurrenceSchema> | null;
        await tx.update(followUps).set({ completedAt, nextOccurrenceAt: recurrence ? nextDueDate(task.dueAt, recurrence) : null }).where(eq(followUps.id, task.id));
        if (recurrence) {
          const dueAt = nextDueDate(task.dueAt, recurrence);
          await tx.insert(followUps).values({ ownerId: task.ownerId, contactId: task.contactId, title: task.title, description: task.description, dueAt, priority: task.priority, recurrenceRule: recurrence, reminderAt: null, escalationAt: null, templateId: task.templateId });
        }
      });
      return { success: true };
    }),
    calendar: protectedProcedure.input(z.object({ start: z.date(), end: z.date() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db.select().from(followUps).where(and(eq(followUps.ownerId, ctx.user.id), isNotNull(followUps.dueAt), gt(followUps.dueAt, input.start), isNull(followUps.archivedAt))).orderBy(asc(followUps.dueAt));
    }),
    templates: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = await requireDb();
        return db.select().from(taskTemplates).where(eq(taskTemplates.ownerId, ctx.user.id)).orderBy(asc(taskTemplates.name));
      }),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), title: z.string().trim().min(1).max(255), description: z.string().trim().max(5000).optional(), defaultDueOffsetDays: z.number().int().min(0).max(3650).nullable().optional(), defaultPriority: prioritySchema.default("medium") })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [created] = await db.insert(taskTemplates).values({ ownerId: ctx.user.id, name: input.name, title: input.title, description: input.description || null, defaultDueOffsetDays: input.defaultDueOffsetDays ?? null, defaultPriority: input.defaultPriority }).$returningId();
        return { id: created.id };
      }),
    }),
    comments: router({
      list: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        const db = await requireDb();
        return db.select().from(taskComments).where(and(eq(taskComments.followUpId, input.taskId), eq(taskComments.ownerId, ctx.user.id))).orderBy(asc(taskComments.createdAt));
      }),
      create: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), body: z.string().trim().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [task] = await db.select().from(followUps).where(and(eq(followUps.id, input.taskId), eq(followUps.ownerId, ctx.user.id))).limit(1);
        if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
        const [created] = await db.insert(taskComments).values({ ownerId: ctx.user.id, followUpId: input.taskId, body: input.body }).$returningId();
        return { id: created.id };
      }),
    }),
  }),

  pipelines: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDefaultPipeline(ctx.user.id);
      const db = await requireDb();
      const ownerPipelines = await db.select().from(pipelines).where(eq(pipelines.ownerId, ctx.user.id)).orderBy(desc(pipelines.isDefault), asc(pipelines.name));
      const ownerStages = await db.select().from(pipelineStages).where(eq(pipelineStages.ownerId, ctx.user.id)).orderBy(asc(pipelineStages.position));
      return ownerPipelines.map(pipeline => ({ ...pipeline, stages: ownerStages.filter(stage => stage.pipelineId === pipeline.id) }));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional(), isDefault: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const existing = await db.select().from(pipelines).where(eq(pipelines.ownerId, ctx.user.id));
      await db.transaction(async tx => {
        if (input.isDefault || existing.length === 0) await tx.update(pipelines).set({ isDefault: false }).where(eq(pipelines.ownerId, ctx.user.id));
        const [created] = await tx.insert(pipelines).values({ ownerId: ctx.user.id, name: input.name, description: input.description || null, isDefault: input.isDefault || existing.length === 0 }).$returningId();
        await tx.insert(pipelineStages).values(defaultStages.map(stage => ({ ...stage, ownerId: ctx.user.id, pipelineId: created.id })));
      });
      return { success: true };
    }),
    archive: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [pipeline] = await db.select().from(pipelines).where(and(eq(pipelines.id, input.id), eq(pipelines.ownerId, ctx.user.id))).limit(1);
      if (!pipeline) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline not found." });
      if (pipeline.isDefault) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose another default pipeline before archiving this one." });
      await db.update(pipelines).set({ isArchived: true }).where(eq(pipelines.id, pipeline.id));
      return { success: true };
    }),
    addStage: protectedProcedure.input(z.object({ pipelineId: z.number().int().positive(), name: z.string().trim().min(1).max(120), position: z.number().int().min(0).max(10000), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), probability: z.number().min(0).max(100), stageKind: z.enum(["open", "won", "lost"]).default("open"), requiresActivityBeforeExit: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [pipeline] = await db.select().from(pipelines).where(and(eq(pipelines.id, input.pipelineId), eq(pipelines.ownerId, ctx.user.id))).limit(1);
      if (!pipeline) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline not found." });
      const [created] = await db.insert(pipelineStages).values({ ...input, ownerId: ctx.user.id, probability: input.probability.toFixed(2) }).$returningId();
      return { id: created.id };
    }),
    updateStage: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120), position: z.number().int().min(0).max(10000), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), probability: z.number().min(0).max(100), stageKind: z.enum(["open", "won", "lost"]), requiresActivityBeforeExit: z.boolean() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [stage] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, input.id), eq(pipelineStages.ownerId, ctx.user.id))).limit(1);
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline stage not found." });
      if (stage.stageKind === "open" && input.stageKind !== "open") {
        const openStages = await db.select().from(pipelineStages).where(and(eq(pipelineStages.pipelineId, stage.pipelineId), eq(pipelineStages.stageKind, "open")));
        if (openStages.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "A pipeline must retain at least one open stage." });
      }
      await db.update(pipelineStages).set({ name: input.name, position: input.position, color: input.color, probability: input.probability.toFixed(2), stageKind: input.stageKind, requiresActivityBeforeExit: input.requiresActivityBeforeExit }).where(eq(pipelineStages.id, stage.id));
      return { success: true };
    }),
    removeStage: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [stage] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, input.id), eq(pipelineStages.ownerId, ctx.user.id))).limit(1);
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline stage not found." });
      const [usingDeal] = await db.select().from(deals).where(and(eq(deals.stageId, stage.id), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (usingDeal) throw new TRPCError({ code: "BAD_REQUEST", message: "Move or archive the deals using this stage before deleting it." });
      if (stage.stageKind === "open") {
        const openStages = await db.select().from(pipelineStages).where(and(eq(pipelineStages.pipelineId, stage.pipelineId), eq(pipelineStages.stageKind, "open")));
        if (openStages.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "A pipeline must retain at least one open stage." });
      }
      await db.delete(pipelineStages).where(eq(pipelineStages.id, stage.id));
      return { success: true };
    }),
    lostReasons: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = await requireDb();
        return db.select().from(lostReasons).where(eq(lostReasons.ownerId, ctx.user.id)).orderBy(asc(lostReasons.position));
      }),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), position: z.number().int().min(0).default(0) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [created] = await db.insert(lostReasons).values({ ownerId: ctx.user.id, name: input.name, position: input.position }).$returningId();
        return { id: created.id };
      }),
      setActive: protectedProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await db.update(lostReasons).set({ isActive: input.isActive }).where(and(eq(lostReasons.id, input.id), eq(lostReasons.ownerId, ctx.user.id)));
        return { success: true };
      }),
    }),
  }),

  deals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDefaultPipeline(ctx.user.id);
      const db = await requireDb();
      const records = await db.select({ deal: deals, contact: contacts, stage: pipelineStages, pipeline: pipelines, lostReason: lostReasons }).from(deals).innerJoin(contacts, eq(deals.contactId, contacts.id)).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).innerJoin(pipelines, eq(deals.pipelineId, pipelines.id)).leftJoin(lostReasons, eq(deals.lostReasonId, lostReasons.id)).where(eq(deals.ownerId, ctx.user.id)).orderBy(desc(deals.updatedAt));
      const weightedForecast = records.filter(record => record.stage.stageKind === "open").reduce((sum, record) => sum + Number(record.deal.amount) * (Number(record.stage.probability) / 100), 0);
      return { records, weightedForecast };
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select({ deal: deals, contact: contacts, stage: pipelineStages, pipeline: pipelines }).from(deals).innerJoin(contacts, eq(deals.contactId, contacts.id)).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).innerJoin(pipelines, eq(deals.pipelineId, pipelines.id)).where(and(eq(deals.id, input.id), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      const history = await db.select({ history: dealStageHistory, fromStage: pipelineStages }).from(dealStageHistory).leftJoin(pipelineStages, eq(dealStageHistory.fromStageId, pipelineStages.id)).where(and(eq(dealStageHistory.dealId, input.id), eq(dealStageHistory.ownerId, ctx.user.id))).orderBy(desc(dealStageHistory.changedAt));
      const dealActivities = await db.select().from(activities).where(and(eq(activities.dealId, input.id), eq(activities.ownerId, ctx.user.id))).orderBy(desc(activities.occurredAt));
      const availableStages = await db.select().from(pipelineStages).where(and(eq(pipelineStages.pipelineId, deal.deal.pipelineId), eq(pipelineStages.ownerId, ctx.user.id))).orderBy(asc(pipelineStages.position));
      return { ...deal, history, activities: dealActivities, availableStages };
    }),
    create: protectedProcedure.input(z.object({ contactId: z.number().int().positive(), companyId: z.number().int().positive().nullable().optional(), pipelineId: z.number().int().positive().optional(), stageId: z.number().int().positive().optional(), title: z.string().trim().min(1).max(255), amount: z.number().min(0).max(999_999_999_999), expectedCloseAt: z.date().nullable().optional() })).mutation(async ({ ctx, input }) => {
      await requireOwnedContact(ctx.user.id, input.contactId);
      await requireOwnedCompany(ctx.user.id, input.companyId);
      const db = await requireDb();
      const pipeline = input.pipelineId ? (await db.select().from(pipelines).where(and(eq(pipelines.id, input.pipelineId), eq(pipelines.ownerId, ctx.user.id), eq(pipelines.isArchived, false))).limit(1))[0] : await ensureDefaultPipeline(ctx.user.id);
      if (!pipeline) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline not found." });
      const stage = input.stageId ? (await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, input.stageId), eq(pipelineStages.pipelineId, pipeline.id), eq(pipelineStages.ownerId, ctx.user.id))).limit(1))[0] : (await db.select().from(pipelineStages).where(and(eq(pipelineStages.pipelineId, pipeline.id), eq(pipelineStages.stageKind, "open"))).orderBy(asc(pipelineStages.position)).limit(1))[0];
      if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "An open stage is required to create a deal." });
      const [created] = await db.insert(deals).values({ ownerId: ctx.user.id, contactId: input.contactId, companyId: input.companyId ?? null, pipelineId: pipeline.id, stageId: stage.id, title: input.title, amount: input.amount.toFixed(2), expectedCloseAt: input.expectedCloseAt ?? null, closedAt: stage.stageKind === "open" ? null : new Date() }).$returningId();
      await db.insert(dealStageHistory).values({ ownerId: ctx.user.id, dealId: created.id, fromStageId: null, toStageId: stage.id });
      return { id: created.id };
    }),
    move: protectedProcedure.input(z.object({ dealId: z.number().int().positive(), stageId: z.number().int().positive(), lostReasonId: z.number().int().positive().nullable().optional(), lostNote: z.string().trim().max(5000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.dealId), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      const [currentStage] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, deal.stageId), eq(pipelineStages.ownerId, ctx.user.id))).limit(1);
      const [nextStage] = await db.select().from(pipelineStages).where(and(eq(pipelineStages.id, input.stageId), eq(pipelineStages.pipelineId, deal.pipelineId), eq(pipelineStages.ownerId, ctx.user.id))).limit(1);
      if (!currentStage || !nextStage) throw new TRPCError({ code: "BAD_REQUEST", message: "Stage does not belong to this deal pipeline." });
      if (currentStage.requiresActivityBeforeExit && currentStage.id !== nextStage.id) {
        const [lastMove] = await db.select().from(dealStageHistory).where(eq(dealStageHistory.dealId, deal.id)).orderBy(desc(dealStageHistory.changedAt)).limit(1);
        const activityRows = await db.select().from(activities).where(and(eq(activities.dealId, deal.id), eq(activities.ownerId, ctx.user.id))).orderBy(desc(activities.occurredAt)).limit(1);
        if (!activityRows.length || (lastMove && activityRows[0].occurredAt <= lastMove.changedAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a deal activity before leaving this stage." });
      }
      if (nextStage.stageKind === "lost") {
        if (!input.lostReasonId) throw new TRPCError({ code: "BAD_REQUEST", message: "A lost reason is required for a lost deal." });
        const [reason] = await db.select().from(lostReasons).where(and(eq(lostReasons.id, input.lostReasonId), eq(lostReasons.ownerId, ctx.user.id), eq(lostReasons.isActive, true))).limit(1);
        if (!reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active lost reason." });
      }
      await db.transaction(async tx => {
        await tx.update(deals).set({ stageId: nextStage.id, lostReasonId: nextStage.stageKind === "lost" ? input.lostReasonId ?? null : null, lostNote: nextStage.stageKind === "lost" ? input.lostNote || null : null, closedAt: nextStage.stageKind === "open" ? null : new Date() }).where(eq(deals.id, deal.id));
        if (currentStage.id !== nextStage.id) await tx.insert(dealStageHistory).values({ ownerId: ctx.user.id, dealId: deal.id, fromStageId: currentStage.id, toStageId: nextStage.id });
      });
      return { success: true };
    }),
    addActivity: protectedProcedure.input(z.object({ dealId: z.number().int().positive(), body: z.string().trim().min(1).max(5000), activityType: z.string().trim().min(1).max(64).default("note") })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.dealId), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      const [created] = await db.insert(activities).values({ ownerId: ctx.user.id, contactId: deal.contactId, dealId: deal.id, activityType: input.activityType, body: input.body }).$returningId();
      return { id: created.id };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.id), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      await db.transaction(async tx => {
        await tx.update(activities).set({ dealId: null }).where(and(eq(activities.dealId, deal.id), eq(activities.ownerId, ctx.user.id)));
        await tx.delete(deals).where(eq(deals.id, deal.id));
      });
      return { success: true };
    }),
  }),
});
