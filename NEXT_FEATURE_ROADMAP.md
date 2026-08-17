# SoloFlowCRM: Recommended Next Additions

## Recommendation

The best next milestone is **operational automation and data-quality hardening**, not another new core entity. Contacts, imports, tasks, deals, and pipelines already form a useful CRM core. The greatest day-to-day value now comes from making those records easier to maintain and ensuring important work does not rely on manual memory.

## Prioritized roadmap

| Priority | Addition | Why it matters now | Suggested scope |
|---|---|---|---|
| 1 | Activate reminders, escalations, and scheduled exports | The data model already stores schedule metadata, but it does not yet execute recurring work. This is the largest gap between recording work and reliably completing it. | Use the supported periodic-workflow integration to run due-task reminders, escalation notices, and saved export configurations. Include job history, idempotency, retry-safe status, and an owner-visible failure state. |
| 2 | Complete contact and deal editing with bulk actions | Core creation and lifecycle flows exist, but daily CRM use needs fast corrections and batching. | Add edit forms, bulk archive/restore, bulk list assignment, bulk relationship-stage updates, bulk task creation, duplicate-review queue, and explicit merge previews. |
| 3 | Improve import mapping and data quality | CSV import is audited, but its current input contract is fixed. Flexible mapping reduces cleanup work during real migrations. | Add CSV column mapping, preview transforms, required-field rules, custom-field mapping, reusable mapping profiles, a validation-only report, and a duplicate-resolution queue. |
| 4 | Build reporting and a true dashboard | Existing metrics are helpful, but decisions need trends and drill-downs. | Add pipeline aging, weighted forecast by close date, stage conversion, win/loss reasons, task completion, overdue follow-ups, source quality, and import error-rate reports. |
| 5 | Add communications and calendar integration | CRM value compounds when outreach and follow-up records are captured automatically. | Integrate Google Calendar and email; show meetings and messages in the contact/deal timeline; create tasks from conversations; offer email templates and activity logging. |
| 6 | Add configurable automation rules | Repeatable workflows should become rules once the underlying scheduled execution is active. | Provide rule triggers such as “new contact,” “deal enters stage,” “no activity for 7 days,” and “task overdue,” with actions to create tasks, assign list membership, or send owner notifications. |
| 7 | Extend the quote foundation | Quote and quote-item tables are already ready, but no user workflow exists. | Add quote creation from deals, line-item editing, totals/taxes, PDF or link generation, status tracking, and won-deal conversion. |
| 8 | Add collaboration only when the product outgrows solo use | The current owner-scoped model is appropriate for one person. Introducing teams too early adds complexity without immediate benefit. | Add team workspaces, roles, assignment, activity ownership, sharing controls, and role-aware reports only after multiple users need simultaneous access. |

## Recommended implementation order

### Milestone 1 — Reliable follow-through

Implement supported recurring workflows for due-task reminders, escalation notifications, and scheduled export generation. Add a job history screen and tests for idempotency and failed-run recovery. This turns the current task and export metadata into dependable operations.

### Milestone 2 — Faster daily data management

Add full contact/deal editing, bulk actions, a duplicate review queue, and a stronger custom-field editor. Complete the multiselect field UX with a true multi-value picker rather than a single-select control. These changes improve the utility of the existing core without expanding the product surface too broadly.

### Milestone 3 — Imports and reporting

Add flexible CSV column mapping and mapping profiles, then build dashboard reports around data quality, follow-ups, pipeline conversion, and aging. Reporting is more valuable after the import process can bring existing customer data in cleanly.

### Milestone 4 — Integrations and automation

Connect email and calendar activity, then add owner-configurable workflow rules. This should follow the schedule-work milestone because automation needs reliable recurring execution and good audit records.

## Quality improvements to make alongside every milestone

Expand the test suite beyond the current unit coverage. The highest-value additions are integration tests for owner isolation, survivor-selected contact merge, import commit/undo, attachment access, lost-stage constraints, activity-required stage exits, and background-job idempotency. Continue to avoid fabricated CRM content; use explicit empty states and owner-created records only.

## What not to prioritize yet

Do not add team roles, complex API/webhook ecosystems, or AI scoring before the first three milestones. They create more surface area but do not solve the immediate operational gaps: ensuring follow-ups happen, making real data import easier, and turning CRM activity into actionable reporting.
