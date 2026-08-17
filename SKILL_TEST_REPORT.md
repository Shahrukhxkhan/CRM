# Solo CRM Delivery Skill Smoke Test

**Skill under test:** `/home/ubuntu/skills/solo-crm-delivery/SKILL.md`  
**Test type:** Controlled workflow dry run  
**Result:** **PASS**

## Representative prompt

> Build a fresh solo CRM using React, tRPC, Drizzle/MySQL, OAuth, and object storage. Include normalized-email duplicate warnings, archive/restore, survivor-selected merge, companies, custom fields, lists, saved JSON searches, attachments, CSV preview/commit/review/undo, immediate and weekly exports, recurring tasks, pipelines, deals, lost reasons, weighted forecast, and exactly seven sidebar sections. Seed a six-stage pipeline for owners who lack one, and never create deals from contacts.

## Workflow verification

| Skill control | Dry-run result |
|---|---|
| CRM applicability detection | Passed: the request correctly triggers the skill. |
| Preflight and schema gate | Passed: the workflow confirms the solo model and stack, then stops for schema approval before implementation. |
| Owner-scoped model | Passed: all CRM business records derive ownership from authenticated context. |
| Contact safety | Passed: normalized email, non-destructive duplicates, survivor-selected transaction-based merge, and archive behavior are required. |
| Import safety | Passed: preview, commit, persisted row review, snapshots, and controlled undo are required. |
| File discipline | Passed: file bytes are routed to object storage and only references remain in the database. |
| Scheduled-work branch | Passed: inactive configuration precedes supported scheduled execution; no in-process timer is permitted. |
| Pipeline seeding | Passed: a default pipeline is only seeded for owners without one and no deal is inferred from contacts. |
| UI constraint | Passed: fixed sidebar requirements are preserved and no fabricated CRM data is allowed. |
| Validation and handoff | Passed: tests, type checks, database safety checks, visual review, checkpointing, and explicit GitHub approval are required. |

## Expected schema-gate response

The skill requires a response equivalent to: “I will first apply an owner-scoped schema for contacts, companies, custom fields/values, lists/members, saved searches, attachments, import audit records, export history, tasks/comments/templates, pipelines/stages/lost reasons, deals, activities, and stage history. The default six-stage pipeline will be created only for owners without one, and no deals will be seeded. Please approve the schema before implementation begins.”

## Result

The smoke test confirms that the skill provides the intended safeguards for the core CRM workflow. It correctly prevents premature UI implementation, requires durable audit structures for high-risk operations, and defers scheduling activation until the application is published and reachable.
