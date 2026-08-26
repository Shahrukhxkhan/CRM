# SoloFlowCRM

SoloFlowCRM is an owner-scoped customer relationship management application for organizing contacts, companies, follow-up work, sales pipelines, deals, quotes, imports, exports, reporting, global search, and reusable Saved Views. It is designed as a focused workspace product: every business record is derived from the authenticated owner context rather than an owner identifier supplied by the client.

## Highlights

- **Contact and company management** with normalized-email duplicate detection, archiving, merging, custom fields, static lists, attachments, and Contact 360° relationship summaries.
- **Auditable CSV workflows** with mapping profiles, transforms, validation previews, duplicate resolution, row-level review, and controlled undo support.
- **Work and revenue tracking** through recurring tasks, reminders, configurable pipelines, deals, stage history, weighted forecasting, quotes, products, price books, and snapshot pricing.
- **Operational visibility** through dashboard reporting, source-quality metrics, exports, global search, and Saved Views for Contacts, Tasks, and Deals.
- **Collaboration foundations** with workspace membership, manager coordination, owner-controlled assignments, and direct-assignee access restrictions.

## Technology

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Radix UI, Wouter |
| API | Express 4, tRPC 11, Zod |
| Data | MySQL/TiDB, Drizzle ORM |
| Authentication | Manus OAuth; Google OIDC foundation prepared but not enabled |
| Storage | S3-compatible object storage for file metadata and bytes |
| Tooling | pnpm, Vite, Vitest, TypeScript, Prettier |

## Core capabilities

| Workspace | Included capabilities |
|---|---|
| Contacts | Contacts, companies, custom fields, duplicate review, archival, merging, static lists, attachments, Contact 360° |
| Imports | CSV preview, mapping profiles, transforms, data-quality reporting, audited commit and undo |
| Tasks | Personal and assigned work, priorities, due dates, recurrence, reminders, templates, comments, calendar-ready dates |
| Deals | Configurable pipelines and stages, stage history, forecasting, lost reasons, activities, assignments |
| Commercial | Quotes, quote items, products, price books, deal line items, discount/tax snapshots |
| Exports | On-demand and schedule-ready owner-scoped export configuration and history |
| Cross-workspace | Global Search, Saved Views, reporting, collaboration controls, automation safeguards |

> The dashboard navigation intentionally remains limited to **Contacts, Lists, Imports, Tasks, Deals, Pipelines, and Exports**. Supporting workflows are embedded inside these areas rather than added as separate sidebar sections.

## Local setup

### Prerequisites

- Node.js 22 or later
- pnpm 10 or later
- A MySQL-compatible database, such as TiDB
- Required authentication and storage environment values supplied by the deployment environment

### Install and run

```bash
git clone https://github.com/Shahrukhxkhan/CRM.git
cd CRM
pnpm install
pnpm dev
```

The development server starts the Express/tRPC application and Vite integration. It must receive the platform-provided database and authentication configuration before protected CRM routes can be used.

## Configuration

Do not commit secrets or a populated `.env` file. In the managed environment, configuration is supplied securely. Local or alternative deployments will require at least:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session signing secret |
| `VITE_APP_ID` | Manus OAuth application identifier |
| `OAUTH_SERVER_URL` | Manus OAuth service URL |
| `VITE_OAUTH_PORTAL_URL` | Manus OAuth portal URL |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Platform service integration values |

Google sign-in is deliberately not enabled until a Google OAuth web client is configured. When resumed, it will require `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and registered development and production callback URIs.

## Database workflow

The schema is defined in `drizzle/schema.ts`, and SQL migrations are stored in `drizzle/`.

1. Review and update the Drizzle schema first.
2. Generate the migration SQL with `pnpm drizzle-kit generate`.
3. Inspect the generated SQL.
4. Apply it through the managed database migration workflow.
5. Verify the deployed schema before continuing.

> Existing production-style migrations have historical partial-application recovery notes. Do not blindly replay old migration files against an already provisioned database.

## Validation

Run the following checks before creating a checkpoint or submitting a change:

```bash
pnpm test
pnpm check
pnpm build
```

The test suite focuses on deterministic CRM logic and security-sensitive boundaries, including normalized email behavior, imports, reporting, quote calculations, Contact 360° timelines, Saved View validation, workspace access rules, and scheduling idempotency. Browser checks should also cover the relevant authenticated workflow, loading state, empty state, success path, and failure path.

## Project structure

```text
client/                 React application and dashboard views
client/src/pages/       CRM workspaces and embedded workflow panels
client/src/components/  Layout and reusable UI components
server/routers/         tRPC CRM procedures and focused tests
server/_core/           Authentication, tRPC context, server bootstrap, platform helpers
drizzle/                Database schema, migrations, and relation metadata
shared/                 Cross-layer constants, types, and deterministic helpers
```

## Data protection and tenancy

SoloFlowCRM enforces owner scoping at the server boundary. Business records use the authenticated user as the source of `ownerId`; clients do not get to choose or mutate that scope. Workspace-member access is constrained to active memberships and directly assigned work, while management actions require the owner or an active manager.

Temporary validation data, if explicitly approved, must be clearly labeled, used only for manual checks, and removed immediately afterward. It must never be added to automated test fixtures or committed to the repository.

## Current roadmap

The following work is intentionally deferred or still requires external configuration:

- Google OIDC sign-in, account linking, application sessions, and Google Cloud credentials.
- Provider-backed Google Calendar and communication capture.
- Real-record Saved View lifecycle and cross-user collaboration validation.
- Additional product/price-book management and richer quote editing controls.

## Contributing

Changes should be incremental and owner-scope aware. For any CRM data-model change, update the schema first, obtain approval where required, generate and inspect a migration, add focused tests, run the validation commands, update `todo.md`, and create a checkpoint before handoff.

## License

This project is licensed under the [MIT License](./LICENSE) when a license file is included in the repository.
