# SoloFlow CRM

SoloFlow CRM is an owner-scoped customer relationship management application for solo operators. It brings leads, contacts, companies, activity history, follow-ups, and quotes into a single private workspace.

The application uses **React, TypeScript, Tailwind CSS, tRPC, Drizzle ORM, MySQL/TiDB, and Manus OAuth**. Each authenticated user can only access records owned by their own workspace.

## Included capabilities

| Area | What is included |
|---|---|
| Authentication | Manus OAuth with protected CRM routes and server procedures. |
| Contacts and leads | Contact CRUD, name/email/company search, tagging, notes, estimated value, and a six-stage pipeline. |
| Pipeline | New, Contacted, Qualified, Proposal, Won, and Lost stages; pointer drag-and-drop, select controls, and keyboard stage movement using `Alt + Left/Right Arrow`. |
| Companies | Company CRUD, contact association, and company pages showing related contacts. |
| Activities | Contact timeline entries for calls, emails, meetings, messages, and notes. |
| Follow-ups | Due-date task queue with active, today, overdue, upcoming, completed, and all filters. |
| Quotes | Multi-line-item quotes with server-calculated line totals, subtotals, totals, and Draft/Sent/Accepted/Declined status. |
| CSV transfer | Owner-scoped contact export plus validated, all-or-nothing CSV import with row-level error reporting. |

## Local setup

### Prerequisites

Install Node.js 22+ and pnpm. The project requires a MySQL-compatible database and the OAuth environment values supplied by the deployment platform.

### Install and run

```bash
git clone https://github.com/Shahrukhxkhan/CRM.git
cd CRM
pnpm install
pnpm dev
```

The development server starts the Express/tRPC backend and Vite frontend together. Do not commit a local `.env` file or production secrets.

## Environment

The runtime receives its configuration from the deployment environment. The important values are shown below; values must remain secret and should not be hardcoded.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string used by Drizzle. |
| `JWT_SECRET` | Signs the server session cookie. |
| `VITE_APP_ID` | Manus OAuth application identifier. |
| `OAUTH_SERVER_URL` | Manus OAuth server base URL. |
| `VITE_OAUTH_PORTAL_URL` | OAuth login portal used by the frontend. |

## Database workflow

The schema lives in `drizzle/schema.ts` and relations in `drizzle/relations.ts`. Whenever the data model changes, generate a migration and apply the reviewed SQL to the target database.

```bash
pnpm drizzle-kit generate
pnpm db:push
```

> Review generated migration SQL before applying it, especially if a migration changes or removes existing data.

The CRM tables store a user `ownerId` where needed. Procedures derive ownership from the authenticated session and never accept a client-provided owner identifier.

## CSV contact import and export

Open **Leads** and use **Export CSV** to download only the current user’s contacts. Use **Import CSV** to add contacts from a CSV file. Imports accept up to **1,000 rows** and **1 MB**, validate every row before writes begin, and do not import anything when any row is invalid.

| Column | Required | Notes |
|---|---:|---|
| `name` | Yes | Contact name. |
| `email` | No | Must be a valid email when supplied. |
| `phone` | No | Phone number. |
| `company` | No | Links to an existing same-owner company or creates one in the same workspace. |
| `source` | No | Lead origin. |
| `estimated_value` | No | Non-negative number. |
| `stage` | No | `new`, `contacted`, `qualified`, `proposal`, `won`, or `lost`. Defaults to `new`. |
| `tags` | No | Separate multiple tags with semicolons, such as `priority;design`. |
| `notes` | No | Contact notes. |

The stable CSV header order and parsing rules are documented in [`docs/contact-csv.md`](docs/contact-csv.md).

## Testing and checks

```bash
pnpm check    # TypeScript validation
pnpm test     # Vitest unit tests
pnpm build    # Production frontend and server build
```

Tests cover authentication behavior, owner-isolation helpers, contact validation and pipeline stages, activity ordering, follow-up completion logic, quote calculations, dashboard aggregation, and CSV parsing/formatting rules.

## Project structure

```text
client/src/pages/       CRM routes and page-level user experiences
client/src/components/  Shared dashboard and UI components
server/routers.ts       tRPC router and protected procedure contracts
server/crm/             CRM services, validation, CSV logic, and tests
drizzle/                Database schema, relations, and migrations
docs/                   Schema, CSV, implementation, and manual test guides
```

## Manual acceptance checks

The practical end-to-end test scenarios for authentication, ownership, lead handling, activities, follow-ups, quotes, and responsive behavior are in [`docs/manual-test-plan.md`](docs/manual-test-plan.md).

## Security and data handling

All CRM reads and writes are owner-scoped. Contacts, activities, follow-ups, and quotes are only returned when the current authenticated user owns the parent record. Quote totals are calculated on the server. CSV files are parsed in memory for the request and are not retained as uploaded files.
