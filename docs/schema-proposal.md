# SoloFlow CRM — Schema Proposal

## Decision summary

This proposal models a lead as a **contact in a lifecycle stage**, rather than maintaining separate lead and contact records. This keeps a prospect’s conversations, tasks, quotes, and eventual customer context in one continuous record. The existing `users` table remains the authentication source of truth. Every primary CRM table stores an `ownerId` that references `users.id`; child-only records are owner-verifiable through their parent.

## Entity schema

| Table | Purpose | Key columns | Relationships and constraints |
|---|---|---|---|
| `companies` | Stores a business or client organization. | `id`, `ownerId`, `name`, `website`, `phone`, `address`, `notes`, `createdAt`, `updatedAt` | Owned by one user. A company may have many contacts. |
| `contacts` | Stores both leads and customers in a single lifecycle record. | `id`, `ownerId`, `companyId?`, `name`, `email?`, `phone?`, `source?`, `estimatedValue?`, `stage`, `notes?`, `createdAt`, `updatedAt` | Owned by one user. `companyId` is nullable and must reference a company with the same owner. |
| `contactTags` | Stores lightweight labels attached to a contact. | `id`, `contactId`, `name`, `createdAt` | Child of a contact. Unique on `(contactId, name)` to avoid duplicate labels. |
| `activities` | Stores calls, emails, meetings, messages, and notes in the contact timeline. | `id`, `ownerId`, `contactId`, `type`, `body`, `occurredAt`, `createdAt`, `updatedAt` | Owned by one user and linked to one same-owner contact. Timeline defaults to newest `occurredAt` first. |
| `followUps` | Stores in-app next actions. | `id`, `ownerId`, `contactId`, `title`, `description?`, `dueAt`, `completedAt?`, `createdAt`, `updatedAt` | Owned by one user and linked to one same-owner contact. Active when `completedAt` is null. |
| `quotes` | Stores quote headers and server-calculated totals. | `id`, `ownerId`, `contactId`, `title`, `status`, `expiresAt?`, `notes?`, `subtotal`, `total`, `createdAt`, `updatedAt` | Owned by one user and linked to one same-owner contact. Cannot be created without valid quote items. |
| `quoteItems` | Stores the billable rows belonging to a quote. | `id`, `quoteId`, `description`, `quantity`, `unitPrice`, `lineTotal`, `position`, `createdAt`, `updatedAt` | Child of a quote. `quantity` must be positive and `unitPrice` cannot be negative. `lineTotal` is computed server-side. |

## Fixed vocabularies

| Field | Allowed values | Default |
|---|---|---|
| `contacts.stage` | `new`, `contacted`, `qualified`, `proposal`, `won`, `lost` | `new` |
| `activities.type` | `call`, `email`, `meeting`, `message`, `note` | `note` |
| `quotes.status` | `draft`, `sent`, `accepted`, `declined` | `draft` |

## Ownership and access policy

Every protected procedure will derive the owner from the authenticated session rather than trusting a client-provided user identifier. Reads, updates, stage changes, completions, and deletes will query on both the record ID and `ownerId`. Child-record mutations will first establish ownership of the parent contact or quote, so a user cannot attach data to another user’s records by guessing IDs.

The database will use foreign keys to guarantee relational integrity. Service helpers will additionally check that a chosen contact and company belong to the same user before assigning `companyId`. The quote service will accept line-item input, validate it, calculate each line total and the quote subtotal/total on the server, and save those computed values in a single transaction.

## Deletion policy

| User action | Result | Rationale |
|---|---|---|
| Delete a company | Set linked contacts’ `companyId` to `NULL`; retain the contacts. | Removing an organization must not erase the user’s prospect and interaction history. |
| Delete a contact | Cascade-delete its tags, activities, follow-ups, quotes, and quote items. | These child records have no independent meaning without their contact. |
| Delete a quote | Cascade-delete its quote items. | A line item cannot exist outside its quote. |
| Delete a user | No application-level deletion flow in this MVP. | Account lifecycle handling is owned by the existing authentication platform. |

## Storage, time, and indexing

All business time values will be stored as UTC-compatible database timestamps and converted to local time only in the user interface. Currency values will use fixed-precision decimals, never binary floating-point values.

| Table | Proposed indexes | Query supported |
|---|---|---|
| `companies` | `(ownerId, name)` | Owner-scoped company listing and name search. |
| `contacts` | `(ownerId, stage, updatedAt)`, `(ownerId, companyId)`, `(ownerId, name)` | Pipeline views, contact lists, company detail, and contact lookup. |
| `activities` | `(ownerId, contactId, occurredAt)` | Contact timeline and recent activity dashboard feed. |
| `followUps` | `(ownerId, completedAt, dueAt)`, `(ownerId, contactId, dueAt)` | Active, completed, overdue, upcoming, and contact-specific queues. |
| `quotes` | `(ownerId, status, updatedAt)`, `(ownerId, contactId, createdAt)` | Pending quote count, status views, and contact quote history. |
| `quoteItems` | `(quoteId, position)` | Ordered quote detail rendering. |

## API boundary and validation rules

The API will use protected tRPC procedures and Zod schemas. Required names cannot be blank. Supplied email values must be valid. Dates must be valid. Estimated values and unit prices cannot be negative. Quote quantities must be greater than zero, quotes must contain at least one valid item, and clients may not submit trusted totals. All destructive operations will require an explicit UI confirmation before the protected procedure is called.

## Explicit MVP choices

There is no standalone `deals` table in the MVP; a contact’s pipeline stage and estimated value represent the opportunity. There are no background reminders, email/SMS sends, calendar synchronization, payment collection, customer-facing quote links, attachments, custom stages, team members, or roles beyond the existing account model.
