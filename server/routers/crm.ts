import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
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
  importMappingProfiles,
  lostReasons,
  ownerAutomationSettings,
  pipelineStages,
  pipelines,
  quotes,
  quoteItems,
  savedContactSearches,
  scheduledExports,
  scheduledJobRuns,
  taskComments,
  taskTemplates,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storageGet, storagePut } from "../storage";
import { COOKIE_NAME } from "../../shared/const";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { isSupportedCronExpression } from "../scheduledWork";
import { protectedProcedure, router } from "../_core/trpc";

const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const recurrenceSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export const quoteStatusSchema = z.enum(["draft", "sent", "accepted", "declined"]);
const fieldTypeSchema = z.enum(["text", "number", "date", "select", "multiselect", "boolean", "url"]);
const sixFieldCronSchema = z.string().trim().max(128).refine(
  isSupportedCronExpression,
  "Use every 5/10/15/30 minutes, hourly, or a fixed daily/weekly UTC hour."
);
const contactInput = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  jobTitle: z.string().trim().max(160).optional().or(z.literal("")),
  leadSource: z.string().trim().max(120).optional().or(z.literal("")),
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
  leadSource: z.string().trim().optional().default(""),
  relationshipStage: z.string().trim().optional().default("Lead"),
});

type ImportRow = z.infer<typeof importRowSchema>;
const importMappingSchema = z.object({
  firstName: z.string().trim().min(1).max(160),
  lastName: z.string().trim().min(1).max(160),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(160).optional(),
  jobTitle: z.string().trim().max(160).optional(),
  leadSource: z.string().trim().max(160).optional(),
  relationshipStage: z.string().trim().max(160).optional(),
});
const importTransformsSchema = z.record(z.string(), z.enum(["trim", "lowercase", "uppercase"])).default({});
const rawImportRowSchema = z.object({ rowNumber: z.number().int().positive(), values: z.record(z.string(), z.string()) });
type ImportMapping = z.infer<typeof importMappingSchema>;
type ImportTransforms = z.infer<typeof importTransformsSchema>;

export function normalizeEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function serializeCustomFieldValue(value: unknown) {
  return JSON.stringify(value);
}

export function calculateQuoteTotal(items: Array<{ quantity: number | string; unitAmount: number | string }>) {
  return items.reduce((total, item) => total + Number(item.quantity) * Number(item.unitAmount), 0);
}

export function mapRawImportRows(rows: z.infer<typeof rawImportRowSchema>[], mapping: ImportMapping, transforms: ImportTransforms): ImportRow[] {
  const valueFor = (row: z.infer<typeof rawImportRowSchema>, field: keyof ImportMapping) => {
    const source = mapping[field];
    let value = source ? row.values[source] ?? "" : "";
    if (transforms[field] === "trim") value = value.trim();
    if (transforms[field] === "lowercase") value = value.trim().toLowerCase();
    if (transforms[field] === "uppercase") value = value.trim().toUpperCase();
    return value;
  };
  return rows.map(row => ({
    rowNumber: row.rowNumber,
    firstName: valueFor(row, "firstName"),
    lastName: valueFor(row, "lastName"),
    email: valueFor(row, "email"),
    phone: valueFor(row, "phone"),
    jobTitle: valueFor(row, "jobTitle"),
    leadSource: valueFor(row, "leadSource"),
    relationshipStage: valueFor(row, "relationshipStage") || "Lead",
  }));
}

export function buildAgingBuckets(updatedAt: Date[], now = Date.now()) {
  const limits = [7, 14, 30];
  return limits.map((days, index) => ({ label: index === 0 ? `0–${days} days` : `${limits[index - 1] + 1}–${days} days`, count: updatedAt.filter(date => now - date.getTime() <= days * 86400000 && (index === 0 || now - date.getTime() > limits[index - 1] * 86400000)).length })).concat([{ label: "31+ days", count: updatedAt.filter(date => now - date.getTime() > 30 * 86400000).length }]);
}

export type SourceQualityValue = { contacts: number; deals: number; wonDeals: number; amount: number; wonAmount: number };

export function buildSourceQualityRows(sources: Map<string, SourceQualityValue>) {
  return Array.from(sources.entries()).map(([source, value]) => ({ source, ...value, contactToDealConversion: value.contacts ? Math.round(value.deals / value.contacts * 100) : 0, dealWinConversion: value.deals ? Math.round(value.wonDeals / value.deals * 100) : 0 })).sort((left, right) => right.amount - left.amount || right.contacts - left.contacts);
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

function sessionTokenFromRequest(headers: { cookie?: string }) {
  return parseCookie(headers.cookie ?? "")[COOKIE_NAME] ?? "";
}

async function getOrCreateAutomationSettings(ownerId: number) {
  const db = await requireDb();
  const [existing] = await db.select().from(ownerAutomationSettings).where(eq(ownerAutomationSettings.ownerId, ownerId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(ownerAutomationSettings).values({ ownerId }).$returningId();
  const [settings] = await db.select().from(ownerAutomationSettings).where(eq(ownerAutomationSettings.id, created.id)).limit(1);
  if (!settings) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create automation settings." });
  return settings;
}

function assertPublishedScheduling() {
  if (process.env.NODE_ENV !== "production") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Publish the latest CRM version before enabling scheduled work.",
    });
  }
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

  reports: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const [ownerContacts, ownerTasks, ownerImports, dealRows, stages] = await Promise.all([
        db.select().from(contacts).where(and(eq(contacts.ownerId, ctx.user.id), isNull(contacts.archivedAt))),
        db.select().from(followUps).where(and(eq(followUps.ownerId, ctx.user.id), isNull(followUps.archivedAt))),
        db.select().from(contactImports).where(eq(contactImports.ownerId, ctx.user.id)).orderBy(desc(contactImports.createdAt)),
        db.select({ deal: deals, stage: pipelineStages, lostReason: lostReasons }).from(deals).innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id)).leftJoin(lostReasons, eq(deals.lostReasonId, lostReasons.id)).where(eq(deals.ownerId, ctx.user.id)),
        db.select().from(pipelineStages).where(eq(pipelineStages.ownerId, ctx.user.id)).orderBy(asc(pipelineStages.position)),
      ]);
      const now = Date.now();
      const contactCompleteness = {
        total: ownerContacts.length,
        withEmail: ownerContacts.filter(contact => Boolean(contact.email)).length,
        withPhone: ownerContacts.filter(contact => Boolean(contact.phone)).length,
        withCompany: ownerContacts.filter(contact => Boolean(contact.companyId)).length,
      };
      const contactsById = new Map(ownerContacts.map(contact => [contact.id, contact]));
      const sources = new Map<string, { contacts: number; deals: number; wonDeals: number; amount: number; wonAmount: number }>();
      ownerContacts.forEach(contact => { const key = contact.leadSource?.trim() || "Unspecified"; const current = sources.get(key) ?? { contacts: 0, deals: 0, wonDeals: 0, amount: 0, wonAmount: 0 }; sources.set(key, { ...current, contacts: current.contacts + 1 }); });
      dealRows.forEach(row => { const key = contactsById.get(row.deal.contactId)?.leadSource?.trim() || "Unspecified"; const current = sources.get(key) ?? { contacts: 0, deals: 0, wonDeals: 0, amount: 0, wonAmount: 0 }; const won = row.stage.stageKind === "won"; sources.set(key, { ...current, deals: current.deals + 1, wonDeals: current.wonDeals + (won ? 1 : 0), amount: current.amount + Number(row.deal.amount), wonAmount: current.wonAmount + (won ? Number(row.deal.amount) : 0) }); });
      const openTasks = ownerTasks.filter(task => !task.completedAt);
      const taskHealth = {
        open: openTasks.length,
        overdue: openTasks.filter(task => task.dueAt && task.dueAt.getTime() < now).length,
        completed: ownerTasks.filter(task => Boolean(task.completedAt)).length,
        dueThisWeek: openTasks.filter(task => task.dueAt && task.dueAt.getTime() >= now && task.dueAt.getTime() <= now + 7 * 86400000).length,
      };
      const stageRows = stages.map(stage => {
        const matching = dealRows.filter(row => row.stage.id === stage.id);
        return { id: stage.id, name: stage.name, stageKind: stage.stageKind, probability: Number(stage.probability), count: matching.length, amount: matching.reduce((sum, row) => sum + Number(row.deal.amount), 0), weightedAmount: matching.filter(row => row.stage.stageKind === "open").reduce((sum, row) => sum + Number(row.deal.amount) * (Number(row.stage.probability) / 100), 0) };
      });
      const aging = buildAgingBuckets(dealRows.filter(row => row.stage.stageKind === "open").map(row => row.deal.updatedAt), now);
      const reasons = new Map<string, { count: number; amount: number }>();
      dealRows.filter(row => row.stage.stageKind === "lost").forEach(row => { const key = row.lostReason?.name ?? "No reason recorded"; const current = reasons.get(key) ?? { count: 0, amount: 0 }; reasons.set(key, { count: current.count + 1, amount: current.amount + Number(row.deal.amount) }); });
      const importQuality = ownerImports.map(item => ({ id: item.id, filename: item.filename, createdAt: item.createdAt, validationOnly: item.isValidationOnly, created: item.createdCount, updated: item.updatedCount, skipped: item.skippedCount, errors: item.failedCount }));
      return { contactCompleteness, taskHealth, funnel: stageRows, aging, winLoss: Array.from(reasons.entries()).map(([reason, value]) => ({ reason, ...value })), importQuality, sourceQuality: buildSourceQualityRows(sources) };
    }),
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
    duplicateCandidates: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const active = await db.select().from(contacts).where(and(eq(contacts.ownerId, ctx.user.id), isNull(contacts.archivedAt), isNull(contacts.mergedIntoContactId))).orderBy(asc(contacts.normalizedEmail), desc(contacts.updatedAt));
      const grouped = new Map<string, typeof active>();
      for (const contact of active) if (contact.normalizedEmail) grouped.set(contact.normalizedEmail, [...(grouped.get(contact.normalizedEmail) ?? []), contact]);
      return Array.from(grouped.entries()).filter(([, matches]) => matches.length > 1).map(([normalizedEmail, matches]) => ({ normalizedEmail, matches }));
    }),
    mergePreview: protectedProcedure.input(z.object({ sourceId: z.number().int().positive(), survivorId: z.number().int().positive() }).refine(input => input.sourceId !== input.survivorId, { message: "Choose two different contacts." })).query(async ({ ctx, input }) => {
      const source = await requireOwnedContact(ctx.user.id, input.sourceId);
      const survivor = await requireOwnedContact(ctx.user.id, input.survivorId);
      const db = await requireDb();
      const [activityRows, taskRows, quoteRows, attachmentRows, dealRows, valueRows, membershipRows] = await Promise.all([
        db.select().from(activities).where(and(eq(activities.contactId, source.id), eq(activities.ownerId, ctx.user.id))),
        db.select().from(followUps).where(and(eq(followUps.contactId, source.id), eq(followUps.ownerId, ctx.user.id))),
        db.select().from(quotes).where(and(eq(quotes.contactId, source.id), eq(quotes.ownerId, ctx.user.id))),
        db.select().from(contactAttachments).where(and(eq(contactAttachments.contactId, source.id), eq(contactAttachments.ownerId, ctx.user.id))),
        db.select().from(deals).where(and(eq(deals.contactId, source.id), eq(deals.ownerId, ctx.user.id))),
        db.select().from(contactCustomFieldValues).where(and(eq(contactCustomFieldValues.contactId, source.id), eq(contactCustomFieldValues.ownerId, ctx.user.id))),
        db.select().from(contactListMembers).where(eq(contactListMembers.contactId, source.id)),
      ]);
      return { source, survivor, impact: { activities: activityRows.length, tasks: taskRows.length, quotes: quoteRows.length, attachments: attachmentRows.length, deals: dealRows.length, customValues: valueRows.length, listMemberships: membershipRows.length } };
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
        leadSource: input.leadSource || null,
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
      const nextLeadSource = input.data.leadSource === undefined ? current.leadSource : input.data.leadSource || null;
      await db.update(contacts).set({
        ...input.data,
        email: nextEmail,
        normalizedEmail: normalizeEmail(nextEmail),
        leadSource: nextLeadSource,
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
    bulkUpdate: protectedProcedure.input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), action: z.enum(["archive", "restore", "relationshipStage", "addToList"]), relationshipStage: z.string().trim().min(1).max(64).optional(), listId: z.number().int().positive().optional() }).superRefine((input, issue) => {
      if (input.action === "relationshipStage" && !input.relationshipStage) issue.addIssue({ code: "custom", message: "A relationship stage is required." });
      if (input.action === "addToList" && !input.listId) issue.addIssue({ code: "custom", message: "A static contact list is required." });
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const owned = await db.select().from(contacts).where(and(eq(contacts.ownerId, ctx.user.id), inArray(contacts.id, input.ids)));
      if (owned.length !== new Set(input.ids).size) throw new TRPCError({ code: "NOT_FOUND", message: "One or more contacts were not found." });
      if (input.action === "archive") await db.update(contacts).set({ archivedAt: new Date() }).where(and(eq(contacts.ownerId, ctx.user.id), inArray(contacts.id, input.ids)));
      if (input.action === "restore") await db.update(contacts).set({ archivedAt: null, mergedIntoContactId: null }).where(and(eq(contacts.ownerId, ctx.user.id), inArray(contacts.id, input.ids)));
      if (input.action === "relationshipStage") await db.update(contacts).set({ relationshipStage: input.relationshipStage! }).where(and(eq(contacts.ownerId, ctx.user.id), inArray(contacts.id, input.ids)));
      if (input.action === "addToList") {
        const [list] = await db.select().from(contactLists).where(and(eq(contactLists.id, input.listId!), eq(contactLists.ownerId, ctx.user.id))).limit(1);
        if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Static contact list not found." });
        const memberships = await db.select().from(contactListMembers).where(and(eq(contactListMembers.listId, list.id), inArray(contactListMembers.contactId, input.ids)));
        const memberIds = new Set(memberships.map(member => member.contactId));
        const additions = input.ids.filter(id => !memberIds.has(id)).map(contactId => ({ listId: list.id, contactId }));
        if (additions.length) await db.insert(contactListMembers).values(additions);
      }
      return { success: true, affected: owned.length };
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
        const serialized = serializeCustomFieldValue(input.value);
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
    profiles: router({
      list: protectedProcedure.query(async ({ ctx }) => {
        const db = await requireDb();
        return db.select().from(importMappingProfiles).where(eq(importMappingProfiles.ownerId, ctx.user.id)).orderBy(asc(importMappingProfiles.name));
      }),
      create: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), sourceHeaders: z.array(z.string().trim().min(1).max(160)).min(1).max(200), mapping: importMappingSchema, transforms: importTransformsSchema, duplicateStrategy: z.enum(["create", "update", "skip"]).default("skip") })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [created] = await db.insert(importMappingProfiles).values({ ownerId: ctx.user.id, name: input.name, sourceHeadersJson: JSON.stringify(input.sourceHeaders), mappingJson: JSON.stringify(input.mapping), transformsJson: JSON.stringify(input.transforms), duplicateStrategy: input.duplicateStrategy }).$returningId();
        return { id: created.id };
      }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(160), sourceHeaders: z.array(z.string().trim().min(1).max(160)).min(1).max(200), mapping: importMappingSchema, transforms: importTransformsSchema, duplicateStrategy: z.enum(["create", "update", "skip"]) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [profile] = await db.select().from(importMappingProfiles).where(and(eq(importMappingProfiles.id, input.id), eq(importMappingProfiles.ownerId, ctx.user.id))).limit(1);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Mapping profile not found." });
        await db.update(importMappingProfiles).set({ name: input.name, sourceHeadersJson: JSON.stringify(input.sourceHeaders), mappingJson: JSON.stringify(input.mapping), transformsJson: JSON.stringify(input.transforms), duplicateStrategy: input.duplicateStrategy }).where(eq(importMappingProfiles.id, profile.id));
        return { success: true };
      }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        await db.delete(importMappingProfiles).where(and(eq(importMappingProfiles.id, input.id), eq(importMappingProfiles.ownerId, ctx.user.id)));
        return { success: true };
      }),
    }),
    validateMapped: protectedProcedure.input(z.object({ filename: z.string().trim().min(1).max(255), mapping: importMappingSchema, transforms: importTransformsSchema, duplicateStrategy: z.enum(["create", "update", "skip"]), rows: z.array(rawImportRowSchema).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const mappedRows = mapRawImportRows(input.rows, input.mapping, input.transforms);
      const preview = await calculateImportPreview(ctx.user.id, mappedRows, input.duplicateStrategy);
      const summary = { totalRows: preview.length, createCount: preview.filter(row => row.action === "create").length, updateCount: preview.filter(row => row.action === "update").length, skipCount: preview.filter(row => row.action === "skip").length, errorCount: preview.filter(row => row.action === "error").length, mapping: input.mapping, transforms: input.transforms };
      const db = await requireDb();
      const [header] = await db.insert(contactImports).values({ ownerId: ctx.user.id, filename: input.filename, columnMappingJson: JSON.stringify(input.mapping), duplicateStrategy: input.duplicateStrategy, status: "completed", isValidationOnly: true, validationSummaryJson: JSON.stringify(summary), createdCount: 0, updatedCount: 0, skippedCount: summary.skipCount, failedCount: summary.errorCount }).$returningId();
      if (preview.length) await db.insert(contactImportRows).values(preview.map(row => ({ importId: header.id, rowNumber: row.rowNumber, action: row.action, sourceJson: JSON.stringify(row), contactId: row.contactId ?? null, errorMessage: row.errorMessage ?? null })));
      return { id: header.id, rows: preview, summary, hasErrors: summary.errorCount > 0 };
    }),
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
            const [created] = await tx.insert(contacts).values({ ownerId: ctx.user.id, firstName: row.firstName, lastName: row.lastName, email: row.email || null, normalizedEmail: row.normalizedEmail, phone: row.phone || null, jobTitle: row.jobTitle || null, leadSource: row.leadSource || null, relationshipStage: row.relationshipStage || "Lead" }).$returningId();
            createdCount += 1;
            await tx.insert(contactImportRows).values({ importId: header.id, rowNumber: row.rowNumber, action: "create", sourceJson, contactId: created.id });
            await tx.insert(contactImportChanges).values({ importId: header.id, contactId: created.id, action: "create", beforeJson: null, afterJson: JSON.stringify(row) });
            continue;
          }
          const [before] = await tx.select().from(contacts).where(and(eq(contacts.id, row.contactId!), eq(contacts.ownerId, ctx.user.id))).limit(1);
          if (!before) throw new TRPCError({ code: "NOT_FOUND", message: `Contact matched by row ${row.rowNumber} no longer exists.` });
          await tx.update(contacts).set({ firstName: row.firstName, lastName: row.lastName, email: row.email || null, normalizedEmail: row.normalizedEmail, phone: row.phone || null, jobTitle: row.jobTitle || null, leadSource: row.leadSource || null, relationshipStage: row.relationshipStage || "Lead" }).where(eq(contacts.id, before.id));
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

  automation: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const settings = await getOrCreateAutomationSettings(ctx.user.id);
      const runs = await db.select().from(scheduledJobRuns).where(eq(scheduledJobRuns.ownerId, ctx.user.id)).orderBy(desc(scheduledJobRuns.createdAt)).limit(50);
      return { settings, runs };
    }),
    saveTaskMonitor: protectedProcedure.input(z.object({ cronExpression: sixFieldCronSchema })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const settings = await getOrCreateAutomationSettings(ctx.user.id);
      if (settings.taskMonitorCronTaskUid) {
        await updateHeartbeatJob(settings.taskMonitorCronTaskUid, { cron: input.cronExpression }, sessionTokenFromRequest(ctx.req.headers));
      }
      await db.update(ownerAutomationSettings).set({ taskMonitorCronExpression: input.cronExpression }).where(eq(ownerAutomationSettings.id, settings.id));
      return { success: true };
    }),
    enableTaskMonitor: protectedProcedure.mutation(async ({ ctx }) => {
      assertPublishedScheduling();
      const db = await requireDb();
      const settings = await getOrCreateAutomationSettings(ctx.user.id);
      const sessionToken = sessionTokenFromRequest(ctx.req.headers);
      let taskUid = settings.taskMonitorCronTaskUid;
      if (taskUid) {
        await updateHeartbeatJob(taskUid, { enable: true, cron: settings.taskMonitorCronExpression }, sessionToken);
      } else {
        const job = await createHeartbeatJob({
          name: `crm-task-monitor-${ctx.user.id}`,
          cron: settings.taskMonitorCronExpression,
          path: "/api/scheduled/task-monitor",
          description: "Processes due SoloFlowCRM task reminders and escalations.",
        }, sessionToken);
        taskUid = job.taskUid;
      }
      await db.update(ownerAutomationSettings).set({ taskMonitorCronTaskUid: taskUid, taskMonitorIsActive: true }).where(eq(ownerAutomationSettings.id, settings.id));
      return { success: true, taskUid };
    }),
    pauseTaskMonitor: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const settings = await getOrCreateAutomationSettings(ctx.user.id);
      if (settings.taskMonitorCronTaskUid) await updateHeartbeatJob(settings.taskMonitorCronTaskUid, { enable: false }, sessionTokenFromRequest(ctx.req.headers));
      await db.update(ownerAutomationSettings).set({ taskMonitorIsActive: false }).where(eq(ownerAutomationSettings.id, settings.id));
      return { success: true };
    }),
    removeTaskMonitor: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const settings = await getOrCreateAutomationSettings(ctx.user.id);
      if (settings.taskMonitorCronTaskUid) await deleteHeartbeatJob(settings.taskMonitorCronTaskUid, sessionTokenFromRequest(ctx.req.headers));
      await db.update(ownerAutomationSettings).set({ taskMonitorCronTaskUid: null, taskMonitorIsActive: false }).where(eq(ownerAutomationSettings.id, settings.id));
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
    createConfiguration: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(160), criteriaJson: z.string().trim().min(2).max(10_000), cronExpression: sixFieldCronSchema })).mutation(async ({ ctx, input }) => {
      assertJson(input.criteriaJson, "Export criteria");
      const db = await requireDb();
      const [created] = await db.insert(scheduledExports).values({ ownerId: ctx.user.id, name: input.name, criteriaJson: input.criteriaJson, cronExpression: input.cronExpression, isActive: false }).$returningId();
      return { id: created.id, note: "Saved as inactive until deployed scheduling is explicitly enabled." };
    }),
    enableConfiguration: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      assertPublishedScheduling();
      const db = await requireDb();
      const [configuration] = await db.select().from(scheduledExports).where(and(eq(scheduledExports.id, input.id), eq(scheduledExports.ownerId, ctx.user.id))).limit(1);
      if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Export configuration not found." });
      if (!isSupportedCronExpression(configuration.cronExpression)) throw new TRPCError({ code: "BAD_REQUEST", message: "Update this legacy export configuration to a supported cron expression before enabling it." });
      const sessionToken = sessionTokenFromRequest(ctx.req.headers);
      let taskUid = configuration.scheduleCronTaskUid;
      if (taskUid) {
        await updateHeartbeatJob(taskUid, { enable: true, cron: configuration.cronExpression }, sessionToken);
      } else {
        const job = await createHeartbeatJob({
          name: `crm-export-${configuration.id}`,
          cron: configuration.cronExpression,
          path: "/api/scheduled/export",
          description: `Generates the SoloFlowCRM export: ${configuration.name}.`,
        }, sessionToken);
        taskUid = job.taskUid;
      }
      await db.update(scheduledExports).set({ scheduleCronTaskUid: taskUid, isActive: true }).where(eq(scheduledExports.id, configuration.id));
      return { success: true, taskUid };
    }),
    pauseConfiguration: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [configuration] = await db.select().from(scheduledExports).where(and(eq(scheduledExports.id, input.id), eq(scheduledExports.ownerId, ctx.user.id))).limit(1);
      if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Export configuration not found." });
      if (configuration.scheduleCronTaskUid) await updateHeartbeatJob(configuration.scheduleCronTaskUid, { enable: false }, sessionTokenFromRequest(ctx.req.headers));
      await db.update(scheduledExports).set({ isActive: false }).where(eq(scheduledExports.id, configuration.id));
      return { success: true };
    }),
    removeConfigurationSchedule: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [configuration] = await db.select().from(scheduledExports).where(and(eq(scheduledExports.id, input.id), eq(scheduledExports.ownerId, ctx.user.id))).limit(1);
      if (!configuration) throw new TRPCError({ code: "NOT_FOUND", message: "Export configuration not found." });
      if (configuration.scheduleCronTaskUid) await deleteHeartbeatJob(configuration.scheduleCronTaskUid, sessionTokenFromRequest(ctx.req.headers));
      await db.update(scheduledExports).set({ scheduleCronTaskUid: null, isActive: false }).where(eq(scheduledExports.id, configuration.id));
      return { success: true };
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

  quotes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select({ quote: quotes, contact: contacts, deal: deals }).from(quotes)
        .leftJoin(contacts, eq(quotes.contactId, contacts.id))
        .leftJoin(deals, eq(quotes.dealId, deals.id))
        .where(eq(quotes.ownerId, ctx.user.id)).orderBy(desc(quotes.updatedAt));
    }),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [record] = await db.select({ quote: quotes, contact: contacts, deal: deals }).from(quotes)
        .leftJoin(contacts, eq(quotes.contactId, contacts.id))
        .leftJoin(deals, eq(quotes.dealId, deals.id))
        .where(and(eq(quotes.id, input.id), eq(quotes.ownerId, ctx.user.id))).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, record.quote.id)).orderBy(asc(quoteItems.createdAt));
      return { ...record, items, calculatedTotal: calculateQuoteTotal(items) };
    }),
    create: protectedProcedure.input(z.object({
      title: z.string().trim().min(1).max(255),
      contactId: z.number().int().positive().nullable().optional(),
      companyId: z.number().int().positive().nullable().optional(),
      dealId: z.number().int().positive().nullable().optional(),
      items: z.array(z.object({ description: z.string().trim().min(1).max(512), quantity: z.number().positive().max(1_000_000), unitAmount: z.number().min(0).max(1_000_000_000) })).default([]),
    })).mutation(async ({ ctx, input }) => {
      if (input.contactId) await requireOwnedContact(ctx.user.id, input.contactId);
      const db = await requireDb();
      if (input.companyId) {
        const [company] = await db.select().from(companies).where(and(eq(companies.id, input.companyId), eq(companies.ownerId, ctx.user.id))).limit(1);
        if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }
      if (input.dealId) {
        const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.dealId), eq(deals.ownerId, ctx.user.id))).limit(1);
        if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      }
      const totalAmount = calculateQuoteTotal(input.items).toFixed(2);
      const [created] = await db.insert(quotes).values({ ownerId: ctx.user.id, title: input.title, contactId: input.contactId ?? null, companyId: input.companyId ?? null, dealId: input.dealId ?? null, totalAmount }).$returningId();
      if (input.items.length) await db.insert(quoteItems).values(input.items.map(item => ({ quoteId: created.id, description: item.description, quantity: item.quantity.toFixed(2), unitAmount: item.unitAmount.toFixed(2) })));
      return { id: created.id };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(255),
      contactId: z.number().int().positive().nullable().optional(),
      companyId: z.number().int().positive().nullable().optional(),
      dealId: z.number().int().positive().nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      if (input.contactId) await requireOwnedContact(ctx.user.id, input.contactId);
      const db = await requireDb();
      const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, input.id), eq(quotes.ownerId, ctx.user.id))).limit(1);
      if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      if (input.companyId) {
        const [company] = await db.select().from(companies).where(and(eq(companies.id, input.companyId), eq(companies.ownerId, ctx.user.id))).limit(1);
        if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });
      }
      if (input.dealId) {
        const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.dealId), eq(deals.ownerId, ctx.user.id))).limit(1);
        if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      }
      await db.update(quotes).set({ title: input.title, contactId: input.contactId ?? null, companyId: input.companyId ?? null, dealId: input.dealId ?? null }).where(eq(quotes.id, quote.id));
      return { success: true };
    }),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: quoteStatusSchema })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const result = await db.update(quotes).set({ status: input.status }).where(and(eq(quotes.id, input.id), eq(quotes.ownerId, ctx.user.id)));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const result = await db.delete(quotes).where(and(eq(quotes.id, input.id), eq(quotes.ownerId, ctx.user.id)));
      if (!result[0].affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
      return { success: true };
    }),
    items: router({
      add: protectedProcedure.input(z.object({ quoteId: z.number().int().positive(), description: z.string().trim().min(1).max(512), quantity: z.number().positive().max(1_000_000), unitAmount: z.number().min(0).max(1_000_000_000) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [quote] = await db.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.ownerId, ctx.user.id))).limit(1);
        if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found." });
        const [created] = await db.insert(quoteItems).values({ quoteId: quote.id, description: input.description, quantity: input.quantity.toFixed(2), unitAmount: input.unitAmount.toFixed(2) }).$returningId();
        const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quote.id));
        await db.update(quotes).set({ totalAmount: calculateQuoteTotal(items).toFixed(2) }).where(eq(quotes.id, quote.id));
        return { id: created.id };
      }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), description: z.string().trim().min(1).max(512), quantity: z.number().positive().max(1_000_000), unitAmount: z.number().min(0).max(1_000_000_000) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [item] = await db.select({ item: quoteItems, quote: quotes }).from(quoteItems).innerJoin(quotes, eq(quoteItems.quoteId, quotes.id)).where(and(eq(quoteItems.id, input.id), eq(quotes.ownerId, ctx.user.id))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found." });
        await db.update(quoteItems).set({ description: input.description, quantity: input.quantity.toFixed(2), unitAmount: input.unitAmount.toFixed(2) }).where(eq(quoteItems.id, item.item.id));
        const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, item.quote.id));
        await db.update(quotes).set({ totalAmount: calculateQuoteTotal(items).toFixed(2) }).where(eq(quotes.id, item.quote.id));
        return { success: true };
      }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const [item] = await db.select({ item: quoteItems, quote: quotes }).from(quoteItems).innerJoin(quotes, eq(quoteItems.quoteId, quotes.id)).where(and(eq(quoteItems.id, input.id), eq(quotes.ownerId, ctx.user.id))).limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found." });
        await db.delete(quoteItems).where(eq(quoteItems.id, item.item.id));
        const remaining = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, item.quote.id));
        await db.update(quotes).set({ totalAmount: calculateQuoteTotal(remaining).toFixed(2) }).where(eq(quotes.id, item.quote.id));
        return { success: true };
      }),
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
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), contactId: z.number().int().positive().optional(), companyId: z.number().int().positive().nullable().optional(), title: z.string().trim().min(1).max(255).optional(), amount: z.number().min(0).max(999_999_999_999).optional(), expectedCloseAt: z.date().nullable().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.id), eq(deals.ownerId, ctx.user.id))).limit(1);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
      if (input.contactId) await requireOwnedContact(ctx.user.id, input.contactId);
      if (input.companyId !== undefined) await requireOwnedCompany(ctx.user.id, input.companyId);
      await db.update(deals).set({ contactId: input.contactId ?? undefined, companyId: input.companyId === undefined ? undefined : input.companyId, title: input.title, amount: input.amount === undefined ? undefined : input.amount.toFixed(2), expectedCloseAt: input.expectedCloseAt === undefined ? undefined : input.expectedCloseAt }).where(eq(deals.id, deal.id));
      return { success: true };
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
