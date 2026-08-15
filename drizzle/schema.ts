import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const companies = mysqlTable(
  "companies",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    website: varchar("website", { length: 2048 }),
    phone: varchar("phone", { length: 64 }),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("companies_owner_name_idx").on(table.ownerId, table.name)],
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: int("companyId").references(() => companies.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 64 }),
    source: varchar("source", { length: 120 }),
    estimatedValue: decimal("estimatedValue", { precision: 12, scale: 2 }),
    stage: mysqlEnum("stage", ["new", "contacted", "qualified", "proposal", "won", "lost"])
      .default("new")
      .notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("contacts_owner_stage_updated_idx").on(table.ownerId, table.stage, table.updatedAt),
    index("contacts_owner_company_idx").on(table.ownerId, table.companyId),
    index("contacts_owner_name_idx").on(table.ownerId, table.name),
  ],
);

export const contactTags = mysqlTable(
  "contactTags",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("contact_tags_contact_name_uq").on(table.contactId, table.name)],
);

export const activities = mysqlTable(
  "activities",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: mysqlEnum("type", ["call", "email", "meeting", "message", "note"]).default("note").notNull(),
    body: text("body").notNull(),
    occurredAt: timestamp("occurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("activities_owner_contact_occurred_idx").on(table.ownerId, table.contactId, table.occurredAt)],
);

export const followUps = mysqlTable(
  "followUps",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueAt: timestamp("dueAt").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("followups_owner_completed_due_idx").on(table.ownerId, table.completedAt, table.dueAt),
    index("followups_owner_contact_due_idx").on(table.ownerId, table.contactId, table.dueAt),
  ],
);

export const quotes = mysqlTable(
  "quotes",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["draft", "sent", "accepted", "declined"]).default("draft").notNull(),
    expiresAt: timestamp("expiresAt"),
    notes: text("notes"),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
    total: decimal("total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("quotes_owner_status_updated_idx").on(table.ownerId, table.status, table.updatedAt),
    index("quotes_owner_contact_created_idx").on(table.ownerId, table.contactId, table.createdAt),
  ],
);

export const quoteItems = mysqlTable(
  "quoteItems",
  {
    id: int("id").autoincrement().primaryKey(),
    quoteId: int("quoteId")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
    lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
    position: int("position").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("quote_items_quote_position_idx").on(table.quoteId, table.position)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
