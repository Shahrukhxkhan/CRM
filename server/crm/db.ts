import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import {
  activities,
  companies,
  contacts,
  contactTags,
  followUps,
  quoteItems,
  quotes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { OPEN_PIPELINE_STAGES, PENDING_QUOTE_STATUSES, type PipelineStage } from "./constants";
import { belongsToOwner } from "./access";
import { databaseUnavailable, invalidRelationship, recordNotFound } from "./errors";
import { buildDashboardSummary, completionTimestamp, newestActivitiesFirst } from "./logic";
import { calculateQuoteTotals, toMoneyString } from "./quoteMath";
import type {
  activityInputSchema,
  companyInputSchema,
  contactInputSchema,
  followUpInputSchema,
  quoteInputSchema,
} from "./validation";
import type { z } from "zod";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type CompanyInput = z.infer<typeof companyInputSchema>;
type ContactInput = z.infer<typeof contactInputSchema>;
type ActivityInput = z.infer<typeof activityInputSchema>;
type FollowUpInput = z.infer<typeof followUpInputSchema>;
type QuoteInput = z.infer<typeof quoteInputSchema>;

type ListContactsInput = {
  query?: string;
  stage?: PipelineStage;
  companyId?: number;
};

type FollowUpState = "all" | "active" | "completed" | "overdue" | "today" | "upcoming";
type ListFollowUpsInput = {
  state?: FollowUpState;
  from?: Date;
  to?: Date;
};

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) databaseUnavailable();
  return db;
}

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const value = (header as { insertId?: number | bigint })?.insertId;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("The database did not return an inserted record ID.");
  }
  return id;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map(tag => tag.trim()).filter(Boolean)));
}

async function assertCompanyOwnership(db: Db, ownerId: number, companyId: number | null | undefined) {
  if (!companyId) return null;
  const [company] = await db
    .select({ id: companies.id, ownerId: companies.ownerId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company || !belongsToOwner(company.ownerId, ownerId)) invalidRelationship("Select a company in your own workspace.");
  return company.id;
}

async function assertContactOwnership(db: Db, ownerId: number, contactId: number) {
  const [contact] = await db
    .select({ id: contacts.id, ownerId: contacts.ownerId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!contact || !belongsToOwner(contact.ownerId, ownerId)) recordNotFound("Contact");
  return contact.id;
}

async function assertQuoteOwnership(db: Db, ownerId: number, quoteId: number) {
  const [quote] = await db
    .select({ id: quotes.id, ownerId: quotes.ownerId })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);
  if (!quote || !belongsToOwner(quote.ownerId, ownerId)) recordNotFound("Quote");
  return quote.id;
}

export async function listCompanies(ownerId: number) {
  const db = await requireDb();
  return db.select().from(companies).where(eq(companies.ownerId, ownerId)).orderBy(asc(companies.name));
}

export async function getCompany(ownerId: number, id: number) {
  const db = await requireDb();
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.ownerId, ownerId)))
    .limit(1);
  if (!company) recordNotFound("Company");
  const companyContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.companyId, id), eq(contacts.ownerId, ownerId)))
    .orderBy(asc(contacts.name));
  return { ...company, contacts: companyContacts };
}

export async function createCompany(ownerId: number, input: CompanyInput) {
  const db = await requireDb();
  const result = await db.insert(companies).values({ ownerId, ...input });
  return getCompany(ownerId, insertId(result));
}

export async function updateCompany(ownerId: number, id: number, input: CompanyInput) {
  const db = await requireDb();
  const result = await db.update(companies).set(input).where(and(eq(companies.id, id), eq(companies.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Company");
  return getCompany(ownerId, id);
}

export async function deleteCompany(ownerId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(companies).where(and(eq(companies.id, id), eq(companies.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Company");
  return { success: true as const };
}

export async function listContacts(ownerId: number, input: ListContactsInput = {}) {
  const db = await requireDb();
  const conditions = [eq(contacts.ownerId, ownerId)];
  if (input.stage) conditions.push(eq(contacts.stage, input.stage));
  if (input.companyId) conditions.push(eq(contacts.companyId, input.companyId));
  if (input.query?.trim()) {
    const value = `%${input.query.trim()}%`;
    conditions.push(or(like(contacts.name, value), like(contacts.email, value), like(companies.name, value))!);
  }
  return db
    .select({ contact: contacts, company: companies })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(contacts.updatedAt), asc(contacts.name));
}

export async function getContact(ownerId: number, id: number) {
  const db = await requireDb();
  const [result] = await db
    .select({ contact: contacts, company: companies })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)))
    .limit(1);
  if (!result) recordNotFound("Contact");

  const [tags, contactActivities, contactFollowUps, contactQuotes] = await Promise.all([
    db.select().from(contactTags).where(eq(contactTags.contactId, id)).orderBy(asc(contactTags.name)),
    db
      .select()
      .from(activities)
      .where(and(eq(activities.ownerId, ownerId), eq(activities.contactId, id)))
      .orderBy(desc(activities.occurredAt), desc(activities.id)),
    db
      .select()
      .from(followUps)
      .where(and(eq(followUps.ownerId, ownerId), eq(followUps.contactId, id)))
      .orderBy(asc(followUps.completedAt), asc(followUps.dueAt)),
    db
      .select()
      .from(quotes)
      .where(and(eq(quotes.ownerId, ownerId), eq(quotes.contactId, id)))
      .orderBy(desc(quotes.createdAt)),
  ]);

  return { ...result, tags, activities: newestActivitiesFirst(contactActivities), followUps: contactFollowUps, quotes: contactQuotes };
}

export async function createContact(ownerId: number, input: ContactInput) {
  const db = await requireDb();
  const companyId = await assertCompanyOwnership(db, ownerId, input.companyId);
  const tags = normalizeTags(input.tags);
  const result = await db.insert(contacts).values({
    ownerId,
    companyId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    source: input.source ?? null,
    estimatedValue: toMoneyString(input.estimatedValue),
    stage: input.stage ?? "new",
    notes: input.notes ?? null,
  });
  const contactId = insertId(result);
  if (tags.length) await db.insert(contactTags).values(tags.map(name => ({ contactId, name })));
  return getContact(ownerId, contactId);
}

export async function updateContact(ownerId: number, id: number, input: ContactInput) {
  const db = await requireDb();
  const companyId = await assertCompanyOwnership(db, ownerId, input.companyId);
  const tags = normalizeTags(input.tags);
  const result = await db
    .update(contacts)
    .set({
      companyId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.source ?? null,
      estimatedValue: toMoneyString(input.estimatedValue),
      stage: input.stage ?? "new",
      notes: input.notes ?? null,
    })
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Contact");
  await db.transaction(async tx => {
    await tx.delete(contactTags).where(eq(contactTags.contactId, id));
    if (tags.length) await tx.insert(contactTags).values(tags.map(name => ({ contactId: id, name })));
  });
  return getContact(ownerId, id);
}

export async function updateContactStage(ownerId: number, id: number, stage: PipelineStage) {
  const db = await requireDb();
  const result = await db.update(contacts).set({ stage }).where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Contact");
  return getContact(ownerId, id);
}

export async function deleteContact(ownerId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Contact");
  return { success: true as const };
}

export async function createActivity(ownerId: number, input: ActivityInput) {
  const db = await requireDb();
  await assertContactOwnership(db, ownerId, input.contactId);
  const result = await db.insert(activities).values({ ownerId, ...input });
  const id = insertId(result);
  const [activity] = await db.select().from(activities).where(and(eq(activities.id, id), eq(activities.ownerId, ownerId))).limit(1);
  if (!activity) recordNotFound("Activity");
  return activity;
}

export async function updateActivity(ownerId: number, id: number, input: ActivityInput) {
  const db = await requireDb();
  await assertContactOwnership(db, ownerId, input.contactId);
  const result = await db
    .update(activities)
    .set({ type: input.type, body: input.body, occurredAt: input.occurredAt, contactId: input.contactId })
    .where(and(eq(activities.id, id), eq(activities.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Activity");
  return { success: true as const };
}

export async function deleteActivity(ownerId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(activities).where(and(eq(activities.id, id), eq(activities.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Activity");
  return { success: true as const };
}

export async function listFollowUps(ownerId: number, input: ListFollowUpsInput = {}) {
  const db = await requireDb();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const state = input.state ?? "active";
  const conditions = [eq(followUps.ownerId, ownerId)];
  if (state === "active") conditions.push(isNull(followUps.completedAt));
  if (state === "completed") conditions.push(isNotNull(followUps.completedAt));
  if (state === "overdue") conditions.push(isNull(followUps.completedAt), lt(followUps.dueAt, now));
  if (state === "today") {
    conditions.push(isNull(followUps.completedAt), gte(followUps.dueAt, startOfToday), lt(followUps.dueAt, startOfTomorrow));
  }
  if (state === "upcoming") conditions.push(isNull(followUps.completedAt), gte(followUps.dueAt, now));
  if (input.from) conditions.push(gte(followUps.dueAt, input.from));
  if (input.to) conditions.push(lte(followUps.dueAt, input.to));
  return db
    .select({ followUp: followUps, contact: contacts })
    .from(followUps)
    .innerJoin(contacts, eq(followUps.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(asc(followUps.completedAt), asc(followUps.dueAt));
}

export async function createFollowUp(ownerId: number, input: FollowUpInput) {
  const db = await requireDb();
  await assertContactOwnership(db, ownerId, input.contactId);
  const result = await db.insert(followUps).values({ ownerId, ...input, description: input.description ?? null });
  const id = insertId(result);
  const [followUp] = await db.select().from(followUps).where(and(eq(followUps.id, id), eq(followUps.ownerId, ownerId))).limit(1);
  if (!followUp) recordNotFound("Follow-up");
  return followUp;
}

export async function updateFollowUp(ownerId: number, id: number, input: FollowUpInput) {
  const db = await requireDb();
  await assertContactOwnership(db, ownerId, input.contactId);
  const result = await db
    .update(followUps)
    .set({ contactId: input.contactId, title: input.title, description: input.description ?? null, dueAt: input.dueAt })
    .where(and(eq(followUps.id, id), eq(followUps.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Follow-up");
  return { success: true as const };
}

export async function setFollowUpCompletion(ownerId: number, id: number, completed: boolean) {
  const db = await requireDb();
  const result = await db
    .update(followUps)
    .set({ completedAt: completionTimestamp(completed) })
    .where(and(eq(followUps.id, id), eq(followUps.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Follow-up");
  return { success: true as const };
}

export async function deleteFollowUp(ownerId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(followUps).where(and(eq(followUps.id, id), eq(followUps.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Follow-up");
  return { success: true as const };
}

export async function listQuotes(ownerId: number, status?: QuoteInput["status"]) {
  const db = await requireDb();
  const conditions = [eq(quotes.ownerId, ownerId)];
  if (status) conditions.push(eq(quotes.status, status));
  return db
    .select({ quote: quotes, contact: contacts })
    .from(quotes)
    .innerJoin(contacts, eq(quotes.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(quotes.updatedAt));
}

export async function getQuote(ownerId: number, id: number) {
  const db = await requireDb();
  const [result] = await db
    .select({ quote: quotes, contact: contacts })
    .from(quotes)
    .innerJoin(contacts, eq(quotes.contactId, contacts.id))
    .where(and(eq(quotes.id, id), eq(quotes.ownerId, ownerId)))
    .limit(1);
  if (!result) recordNotFound("Quote");
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position));
  return { ...result, items };
}

async function saveQuote(ownerId: number, id: number | null, input: QuoteInput) {
  const db = await requireDb();
  await assertContactOwnership(db, ownerId, input.contactId);
  const totals = calculateQuoteTotals(input.items);
  const quoteId = await db.transaction(async tx => {
    if (id) {
      const result = await tx
        .update(quotes)
        .set({
          contactId: input.contactId,
          title: input.title,
          status: input.status ?? "draft",
          expiresAt: input.expiresAt ?? null,
          notes: input.notes ?? null,
          subtotal: totals.subtotal,
          total: totals.total,
        })
        .where(and(eq(quotes.id, id), eq(quotes.ownerId, ownerId)));
      if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Quote");
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      await tx.insert(quoteItems).values(
        totals.items.map((item, position) => ({
          quoteId: id,
          description: item.description,
          quantity: toMoneyString(item.quantity)!,
          unitPrice: toMoneyString(item.unitPrice)!,
          lineTotal: item.lineTotal,
          position,
        })),
      );
      return id;
    }
    const result = await tx.insert(quotes).values({
      ownerId,
      contactId: input.contactId,
      title: input.title,
      status: input.status ?? "draft",
      expiresAt: input.expiresAt ?? null,
      notes: input.notes ?? null,
      subtotal: totals.subtotal,
      total: totals.total,
    });
    const createdId = insertId(result);
    await tx.insert(quoteItems).values(
      totals.items.map((item, position) => ({
        quoteId: createdId,
        description: item.description,
        quantity: toMoneyString(item.quantity)!,
        unitPrice: toMoneyString(item.unitPrice)!,
        lineTotal: item.lineTotal,
        position,
      })),
    );
    return createdId;
  });
  return getQuote(ownerId, quoteId);
}

export async function createQuote(ownerId: number, input: QuoteInput) {
  return saveQuote(ownerId, null, input);
}

export async function updateQuote(ownerId: number, id: number, input: QuoteInput) {
  return saveQuote(ownerId, id, input);
}

export async function updateQuoteStatus(ownerId: number, id: number, status: NonNullable<QuoteInput["status"]>) {
  const db = await requireDb();
  await assertQuoteOwnership(db, ownerId, id);
  await db.update(quotes).set({ status }).where(and(eq(quotes.id, id), eq(quotes.ownerId, ownerId)));
  return getQuote(ownerId, id);
}

export async function deleteQuote(ownerId: number, id: number) {
  const db = await requireDb();
  const result = await db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.ownerId, ownerId)));
  if (Number((result as { rowsAffected?: number }).rowsAffected) === 0) recordNotFound("Quote");
  return { success: true as const };
}

export async function getDashboard(ownerId: number) {
  const db = await requireDb();
  const now = new Date();
  const [openLeadCount, pipelineValue, overdueFollowUps, pendingQuotes, stageSummary, recentActivities, actionQueue] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(contacts).where(and(eq(contacts.ownerId, ownerId), inArray(contacts.stage, OPEN_PIPELINE_STAGES))),
    db
      .select({ value: sql<string>`coalesce(sum(${contacts.estimatedValue}), 0)` })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.stage, OPEN_PIPELINE_STAGES))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(followUps)
      .where(and(eq(followUps.ownerId, ownerId), isNull(followUps.completedAt), lt(followUps.dueAt, now))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(quotes)
      .where(and(eq(quotes.ownerId, ownerId), inArray(quotes.status, PENDING_QUOTE_STATUSES))),
    db
      .select({ stage: contacts.stage, count: sql<number>`count(*)`, value: sql<string>`coalesce(sum(${contacts.estimatedValue}), 0)` })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.stage, OPEN_PIPELINE_STAGES)))
      .groupBy(contacts.stage),
    db
      .select({ activity: activities, contactName: contacts.name })
      .from(activities)
      .innerJoin(contacts, eq(activities.contactId, contacts.id))
      .where(eq(activities.ownerId, ownerId))
      .orderBy(desc(activities.occurredAt))
      .limit(8),
    db
      .select({ followUp: followUps, contactName: contacts.name })
      .from(followUps)
      .innerJoin(contacts, eq(followUps.contactId, contacts.id))
      .where(and(eq(followUps.ownerId, ownerId), isNull(followUps.completedAt)))
      .orderBy(asc(followUps.dueAt))
      .limit(8),
  ]);

  return buildDashboardSummary({
    openLeadCount: Number(openLeadCount[0]?.count ?? 0),
    pipelineValue: pipelineValue[0]?.value ?? "0.00",
    overdueFollowUpCount: Number(overdueFollowUps[0]?.count ?? 0),
    pendingQuoteCount: Number(pendingQuotes[0]?.count ?? 0),
    stageSummary,
    recentActivities,
    actionQueue,
  });
}
