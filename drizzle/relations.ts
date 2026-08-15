import { relations } from "drizzle-orm";
import { activities, companies, contacts, contactTags, followUps, quoteItems, quotes, users } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  companies: many(companies),
  contacts: many(contacts),
  activities: many(activities),
  followUps: many(followUps),
  quotes: many(quotes),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, { fields: [companies.ownerId], references: [users.id] }),
  contacts: many(contacts),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  owner: one(users, { fields: [contacts.ownerId], references: [users.id] }),
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  tags: many(contactTags),
  activities: many(activities),
  followUps: many(followUps),
  quotes: many(quotes),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  owner: one(users, { fields: [activities.ownerId], references: [users.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  owner: one(users, { fields: [followUps.ownerId], references: [users.id] }),
  contact: one(contacts, { fields: [followUps.contactId], references: [contacts.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  owner: one(users, { fields: [quotes.ownerId], references: [users.id] }),
  contact: one(contacts, { fields: [quotes.contactId], references: [contacts.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
}));
