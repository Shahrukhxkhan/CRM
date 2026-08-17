# SoloFlowCRM Manual Test Guide

## Contacts, companies, and lists

Create a company on **Contacts**, then create two contacts sharing the same email with different casing. The contact creation acknowledgement will flag the duplicate without blocking either record. Open a contact’s details to define custom fields, set values, add the contact to a static list, and upload an attachment smaller than 10 MB. Use **Merge** to select a survivor, then verify the source record appears only when archived contacts are included.

## CSV imports and exports

On **Imports**, select a CSV with `firstName,lastName,email,phone,jobTitle,relationshipStage` headers. Preview before committing; invalid rows prevent commit. After a successful commit, inspect its counters and use **Undo import** to archive imported contacts or restore update snapshots. Open `/imports/review` to inspect the persisted per-row action, contact reference, source data, and error detail for any import. On **Exports**, generate a CSV immediately and verify it appears in export history; configuration records remain inactive until deployed scheduling is explicitly enabled.

## Tasks

Create a simple task, complete it, and verify it leaves the open list. Create a recurring task with reminder or escalation timestamps in the advanced panel, then complete it to confirm the current record remains completed while a next occurrence is created. Add a task template, select a task, and add comments. The seven-day calendar is derived from stored task due dates.

## Deals and pipelines

Create a contact, then create a deal. In **Pipelines**, review the seeded six-stage default pipeline, add a lost reason, and configure a new stage. In **Deals**, select an opportunity, log a deal activity, and move it through stages; moving to **Lost** requires an active lost reason, while a stage configured to require activity cannot be exited until a later deal activity exists. Verify the stage history and weighted forecast update.

## Automated checks

Run `pnpm check` for TypeScript validation and `pnpm test` for the unit suite. The current tests cover normalized email matching and recurring-task next-occurrence calculation, alongside the scaffolded authentication logout test.
