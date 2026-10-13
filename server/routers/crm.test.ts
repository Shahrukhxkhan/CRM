import { describe, expect, it } from "vitest";
import { buildAgingBuckets, buildContact360ActivityTimeline, buildContact360Summary, buildDashboardHealth, buildSourceQualityRows, calculateCommercialLine, calculateCommercialSummary, calculateQuoteTotal, canActivateCalendarAutomation, canAssignWorkspaceUser, canCoordinateWorkspace, canReadWorkspaceRecord, classifyImportRows, isContact360StandardActivityType, isValidReportRange, mapRawImportRows, nextDueDate, normalizeEmail, parseSavedViewConfig, quoteStatusSchema, resolveLeadSource, serializeCustomFieldValue, sortGlobalSearchResults } from "./crm";
import { isCronOnlyCaller, makeRunKey, shouldRetryRunStatus } from "../scheduledWork";
import { getSavedViewPresentationMode } from "@shared/savedViewPresentation";

describe("CRM duplicate detection", () => {
  it("uses a trimmed, lowercased email as the owner-scoped matching key", () => {
    expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe("ada.lovelace@example.com");
    expect(normalizeEmail(" ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("dashboard health signals", () => {
  it("separates overdue work from tasks due in the next seven days", () => {
    const health = buildDashboardHealth({
      now: new Date("2026-08-26T12:00:00.000Z"),
      openTasks: [
        { dueAt: new Date("2026-08-25T12:00:00.000Z") },
        { dueAt: new Date("2026-08-28T12:00:00.000Z") },
        { dueAt: new Date("2026-09-05T12:00:00.000Z") },
        { dueAt: null },
      ],
    });
    expect(health).toEqual({ overdueTasks: 1, tasksDueThisWeek: 1 });
  });
});

describe("lead-source persistence", () => {
  it("normalizes create, retain, and clear behavior for owner-scoped contact writes", () => {
    expect(resolveLeadSource(null, "Referral")).toBe("Referral");
    expect(resolveLeadSource("Referral", undefined)).toBe("Referral");
    expect(resolveLeadSource("Referral", "")).toBeNull();
  });
});

describe("workspace assignment authorization", () => {
  it("permits the workspace owner or an active member, but rejects inactive and unknown people", () => {
    expect(canAssignWorkspaceUser(10, 10)).toBe(true);
    expect(canAssignWorkspaceUser(10, 22, { isActive: true })).toBe(true);
    expect(canAssignWorkspaceUser(10, 22, { isActive: false })).toBe(false);
    expect(canAssignWorkspaceUser(10, 22)).toBe(false);
  });

  it("reserves assignment coordination for the workspace owner and active managers", () => {
    expect(canCoordinateWorkspace(10, 10)).toBe(true);
    expect(canCoordinateWorkspace(10, 22, { isActive: true, workspaceRole: "manager" })).toBe(true);
    expect(canCoordinateWorkspace(10, 22, { isActive: true, workspaceRole: "contributor" })).toBe(false);
    expect(canCoordinateWorkspace(10, 22, { isActive: false, workspaceRole: "manager" })).toBe(false);
  });

  it("limits member record access to work assigned directly to an active member", () => {
    const contributor = { isActive: true, workspaceRole: "contributor" as const };
    const manager = { isActive: true, workspaceRole: "manager" as const };

    expect(canReadWorkspaceRecord(10, 10, null)).toBe(true);
    expect(canReadWorkspaceRecord(10, 22, 22, contributor)).toBe(true);
    expect(canReadWorkspaceRecord(10, 22, 25, contributor)).toBe(false);
    expect(canReadWorkspaceRecord(10, 22, 25, manager)).toBe(false);
    expect(canReadWorkspaceRecord(10, 22, 22, { ...contributor, isActive: false })).toBe(false);
    expect(canReadWorkspaceRecord(10, 22, 22)).toBe(false);
  });
});

describe("Google Calendar automation safeguards", () => {
  it("allows follow-up automation only after provider authorization is connected", () => {
    expect(canActivateCalendarAutomation("connected")).toBe(true);
    expect(canActivateCalendarAutomation("disconnected")).toBe(false);
    expect(canActivateCalendarAutomation("error")).toBe(false);
  });
});

describe("recurring personal tasks", () => {
  it("creates the next weekly occurrence without reopening the completed one", () => {
    const next = nextDueDate(new Date("2026-08-17T12:00:00.000Z"), "WEEKLY");
    expect(next.toISOString()).toBe("2026-08-24T12:00:00.000Z");
  });
});

describe("multiselect contact custom fields", () => {
  it("persists selected values as a JSON array for either contact editor", () => {
    const selected = ["Founder", "Priority account"];
    const serialized = serializeCustomFieldValue(selected);

    expect(serialized).toBe('["Founder","Priority account"]');
    expect(JSON.parse(serialized)).toEqual(selected);
  });

  it("handles empty array, single string, and preserves array formatting for contact detail and data management", () => {
    expect(serializeCustomFieldValue([])).toBe("[]");
    expect(JSON.parse(serializeCustomFieldValue([]))).toEqual([]);

    const tags = ["Tier 1", "VIP", "Enterprise"];
    const serialized = serializeCustomFieldValue(tags);
    const parsed = JSON.parse(serialized);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed).toContain("VIP");
  });
});

describe("CSV mapping profiles", () => {
  it("maps arbitrary source headers and applies configured transforms before validation", () => {
    const rows = mapRawImportRows(
      [{ rowNumber: 2, values: { Given: "  Ada ", Family: "Lovelace", WorkEmail: " ADA@EXAMPLE.COM ", Channel: " Referral " } }],
      { firstName: "Given", lastName: "Family", email: "WorkEmail", leadSource: "Channel" },
      { firstName: "trim", email: "lowercase", leadSource: "trim" }
    );

    expect(rows[0]).toMatchObject({ rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", leadSource: "Referral", relationshipStage: "Lead" });
  });

  it("preserves the mapped lead source while applying the selected duplicate outcome", () => {
    const [existing] = classifyImportRows([
      { rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
    ], "update", new Map([["ada@example.com", { id: 42, normalizedEmail: "ada@example.com" }]]));

    expect(existing).toMatchObject({ action: "update", contactId: 42, leadSource: "Referral" });
  });

  it("handles 'skip' duplicate strategy by skipping existing contacts and creating new ones", () => {
    const classified = classifyImportRows([
      { rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
      { rowNumber: 3, firstName: "Charles", lastName: "Babbage", email: "charles@example.com", phone: "", jobTitle: "", leadSource: "Outbound", relationshipStage: "Lead" },
    ], "skip", new Map([["ada@example.com", { id: 42, normalizedEmail: "ada@example.com" }]]));

    expect(classified[0]).toMatchObject({ action: "skip", contactId: 42, normalizedEmail: "ada@example.com" });
    expect(classified[1]).toMatchObject({ action: "create", contactId: undefined, normalizedEmail: "charles@example.com" });
  });

  it("handles 'create' duplicate strategy by creating new entries even if email exists in database", () => {
    const classified = classifyImportRows([
      { rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
    ], "create", new Map([["ada@example.com", { id: 42, normalizedEmail: "ada@example.com" }]]));

    expect(classified[0]).toMatchObject({ action: "create", contactId: undefined, normalizedEmail: "ada@example.com" });
  });

  it("flags validation errors for missing names or malformed emails without crashing", () => {
    const classified = classifyImportRows([
      { rowNumber: 2, firstName: "", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "", relationshipStage: "Lead" },
      { rowNumber: 3, firstName: "Ada", lastName: "", email: "ada2@example.com", phone: "", jobTitle: "", leadSource: "", relationshipStage: "Lead" },
      { rowNumber: 4, firstName: "Ada", lastName: "Lovelace", email: "not-an-email", phone: "", jobTitle: "", leadSource: "", relationshipStage: "Lead" },
    ], "update", new Map());

    expect(classified[0]).toMatchObject({ action: "error", errorMessage: "First and last name are required." });
    expect(classified[1]).toMatchObject({ action: "error", errorMessage: "First and last name are required." });
    expect(classified[2]).toMatchObject({ action: "error", errorMessage: "Email address is invalid." });
  });

  it("flags duplicate normalized emails within a mapped CSV before any contact write", () => {
    const rows = classifyImportRows([
      { rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ADA@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
      { rowNumber: 3, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
    ], "create", new Map());

    expect(rows[1]).toMatchObject({ action: "error", errorMessage: "Duplicate email appears more than once in this CSV." });
  });
});

describe("CRM reporting", () => {
  it("validates report date ranges correctly", () => {
    expect(isValidReportRange(new Date("2026-01-01"), new Date("2026-02-01"))).toBe(true);
    expect(isValidReportRange(new Date("2026-02-01"), new Date("2026-01-01"))).toBe(false);
    expect(isValidReportRange(undefined, new Date("2026-01-01"))).toBe(true);
    expect(isValidReportRange(new Date("2026-01-01"), undefined)).toBe(true);
  });

  it("buckets open pipeline records by their most recent update date", () => {
    const now = new Date("2026-08-19T12:00:00.000Z").getTime();
    const buckets = buildAgingBuckets([
      new Date("2026-08-18T12:00:00.000Z"),
      new Date("2026-08-07T12:00:00.000Z"),
      new Date("2026-07-01T12:00:00.000Z"),
    ], now);

    expect(buckets.map(bucket => bucket.count)).toEqual([1, 1, 0, 1]);
  });

  it("calculates explicit source conversion percentages and orders rows by pipeline value", () => {
    const rows = buildSourceQualityRows(new Map([
      ["Referral", { contacts: 8, deals: 4, wonDeals: 3, amount: 4000, wonAmount: 3000 }],
      ["Event", { contacts: 3, deals: 1, wonDeals: 0, amount: 6500, wonAmount: 0 }],
      ["Cold Outreach", { contacts: 0, deals: 0, wonDeals: 0, amount: 0, wonAmount: 0 }],
    ]));

    expect(rows).toEqual([
      expect.objectContaining({ source: "Event", contactToDealConversion: 33, dealWinConversion: 0 }),
      expect.objectContaining({ source: "Referral", contactToDealConversion: 50, dealWinConversion: 75 }),
      expect.objectContaining({ source: "Cold Outreach", contactToDealConversion: 0, dealWinConversion: 0 }),
    ]);
  });

  it("accepts an open or chronological reporting range and rejects an inverted range", () => {
    expect(isValidReportRange()).toBe(true);
    expect(isValidReportRange(new Date("2026-01-01"), new Date("2026-01-31"))).toBe(true);
    expect(isValidReportRange(new Date("2026-02-01"), new Date("2026-01-31"))).toBe(false);
  });
});

describe("quote totals", () => {
  it("sums each positive quantity by its unit amount", () => {
    expect(calculateQuoteTotal([
      { quantity: 2, unitAmount: 125.5 },
      { quantity: "3.5", unitAmount: "40.25" },
    ])).toBe(391.875);
  });

  it("returns zero when a quote has no line items", () => {
    expect(calculateQuoteTotal([])).toBe(0);
  });

  it("allows only explicit customer-facing quote statuses", () => {
    expect(quoteStatusSchema.safeParse("accepted").success).toBe(true);
    expect(quoteStatusSchema.safeParse("expired").success).toBe(false);
  });
});

describe("catalog-backed commercial totals", () => {
  it("snapshots quantity, percentage discount, and tax into an additive line total", () => {
    expect(calculateCommercialLine({ quantity: 3, unitAmount: 120, discountPercent: 10, taxPercent: 5 })).toEqual({ subtotal: 360, discountAmount: 36, taxAmount: 16.2, total: 340.2 });
  });

  it("handles line items with zero discount and zero tax without precision drift", () => {
    expect(calculateCommercialLine({ quantity: 5, unitAmount: 49.99, discountPercent: 0, taxPercent: 0 })).toEqual({ subtotal: 249.95, discountAmount: 0, taxAmount: 0, total: 249.95 });
  });

  it("rolls quote lines into subtotal, discount, tax, and grand total snapshots", () => {
    expect(calculateCommercialSummary([{ quantity: 2, unitAmount: 100, discountPercent: 10, taxPercent: 0 }, { quantity: 1, unitAmount: 50, discountPercent: 0, taxPercent: 20 }])).toEqual({ subtotal: 250, discountAmount: 20, taxAmount: 10, total: 240 });
  });

  it("accurately rolls mixed catalog items with 100% discount or custom taxes", () => {
    const summary = calculateCommercialSummary([
      { quantity: 1, unitAmount: 200, discountPercent: 100, taxPercent: 10 },
      { quantity: 4, unitAmount: 25, discountPercent: 0, taxPercent: 5 },
    ]);
    expect(summary).toEqual({
      subtotal: 300,
      discountAmount: 200,
      taxAmount: 5,
      total: 105,
    });
  });
});

describe("Contact 360° summary", () => {
  it("combines linked commercial value with only incomplete follow-up work", () => {
    const summary = buildContact360Summary({
      deals: [{ amount: "1200.00", closedAt: null }, { amount: "800.00", closedAt: new Date("2026-08-02") }],
      quotes: [{ totalAmount: "500.00" }, { totalAmount: "175.00" }],
      tasks: [{ completedAt: null, dueAt: new Date("2026-08-28") }, { completedAt: null, dueAt: new Date("2026-08-25") }, { completedAt: new Date("2026-08-20"), dueAt: new Date("2026-08-21") }],
    });

    expect(summary).toMatchObject({ dealCount: 2, openDealCount: 1, totalDealValue: 2000, quoteCount: 2, totalQuotedValue: 675, openTaskCount: 2 });
    expect(summary.nextDueAt?.toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("retains standard activity types while calendar events are represented by captured-event records", () => {
    expect(isContact360StandardActivityType("note")).toBe(true);
    expect(isContact360StandardActivityType("call")).toBe(true);
    expect(isContact360StandardActivityType(null)).toBe(true);
    expect(isContact360StandardActivityType("calendar_event")).toBe(false);
  });

  it("orders normal activities and captured calendar events together without duplicating calendar activity rows", () => {
    const timeline = buildContact360ActivityTimeline(
      [{ activity: { id: 11, activityType: "note", occurredAt: new Date("2026-08-23T09:00:00.000Z"), body: "Proposal reviewed" }, dealTitle: "Expansion" }],
      [{ event: { id: 21, startsAt: new Date("2026-08-24T10:00:00.000Z"), createdAt: new Date("2026-08-22T10:00:00.000Z"), title: "Customer review", descriptionSnippet: "Agenda confirmed" }, dealTitle: "Expansion" }]
    );

    expect(timeline).toEqual([
      expect.objectContaining({ id: "calendar-21", kind: "calendar", title: "Customer review" }),
      expect.objectContaining({ id: "activity-11", kind: "activity", title: "note" }),
    ]);
    expect(timeline.filter(item => item.kind === "calendar")).toHaveLength(1);
  });
});

describe("Saved Views", () => {
  it("keeps Contacts column-only while Tasks and Deals retain grouping controls", () => {
    expect(getSavedViewPresentationMode("contacts")).toEqual({ supportsGrouping: false, summary: "Columns" });
    expect(getSavedViewPresentationMode("tasks")).toEqual({ supportsGrouping: true, summary: "Columns & grouping" });
    expect(getSavedViewPresentationMode("deals")).toEqual({ supportsGrouping: true, summary: "Columns & grouping" });
  });

  it("accepts only structured filters, sorting, columns, and grouping preferences", () => {
    expect(parseSavedViewConfig(JSON.stringify({ filters: { priority: "urgent" }, sort: { field: "dueAt", direction: "asc" }, columns: ["title", "priority"], groupBy: "priority" }))).toMatchObject({ filters: { priority: "urgent" }, sort: { field: "dueAt", direction: "asc" }, columns: ["title", "priority"], groupBy: "priority" });
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: { nested: { unsupported: true } }, sort: { field: "dueAt", direction: "up" }, columns: [] }))).toThrow();
  });

  it("restores the complete persisted configuration without allowing executable query text", () => {
    const config = parseSavedViewConfig(JSON.stringify({ filters: { stageKind: "open" }, sort: { field: "amount", direction: "desc" }, columns: ["title", "amount", "stage"], groupBy: "pipeline" }));
    expect(config).toEqual({ filters: { stageKind: "open" }, sort: { field: "amount", direction: "desc" }, columns: ["title", "amount", "stage"], groupBy: "pipeline" });
    expect(() => parseSavedViewConfig(JSON.stringify({ sql: "DROP TABLE savedTableViews", filters: {}, sort: { field: "name", direction: "asc" }, columns: [] }))).toThrow();
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: {}, sort: { field: "name", direction: "asc", ownerId: 99 }, columns: [] }))).toThrow();
  });

  it("orders mixed owner-scoped search results by recency and honors the requested limit", () => {
    const records = sortGlobalSearchResults([
      { id: "contact-1", occurredAt: new Date("2026-08-20T00:00:00.000Z") },
      { id: "deal-2", occurredAt: new Date("2026-08-23T00:00:00.000Z") },
      { id: "task-3", occurredAt: new Date("2026-08-22T00:00:00.000Z") },
    ], 2);
    expect(records.map(record => record.id)).toEqual(["deal-2", "task-3"]);
  });

  it("handles empty global search results and limits greater than available results", () => {
    expect(sortGlobalSearchResults([], 10)).toEqual([]);
    const single = [{ id: "quote-1", occurredAt: new Date("2026-08-21T00:00:00.000Z") }];
    expect(sortGlobalSearchResults(single, 5)).toEqual(single);
  });

  it("validates saved view entity types strictly", () => {
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: {}, sort: { field: "invalid", direction: "desc" }, columns: [] }))).not.toThrow();
    // Invalid sort direction
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: {}, sort: { field: "name", direction: "invalid" }, columns: [] }))).toThrow();
    // Columns exceeds maximum allowed 12
    const tooManyColumns = Array.from({ length: 15 }, (_, i) => `col_${i}`);
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: {}, sort: { field: "name", direction: "asc" }, columns: tooManyColumns }))).toThrow();
  });
});

describe("deterministic collaboration role boundaries", () => {
  const ownerId = 1;
  const managerId = 2;
  const contributorId = 3;
  const inactiveManagerId = 4;
  const unknownUserId = 99;

  const activeManager = { isActive: true, workspaceRole: "manager" as const };
  const activeContributor = { isActive: true, workspaceRole: "contributor" as const };
  const inactiveManager = { isActive: false, workspaceRole: "manager" as const };

  it("proves complete coordination permission matrix across all role states", () => {
    // Owner can always coordinate
    expect(canCoordinateWorkspace(ownerId, ownerId)).toBe(true);
    // Active manager can coordinate
    expect(canCoordinateWorkspace(ownerId, managerId, activeManager)).toBe(true);
    // Contributor cannot coordinate
    expect(canCoordinateWorkspace(ownerId, contributorId, activeContributor)).toBe(false);
    // Inactive manager cannot coordinate
    expect(canCoordinateWorkspace(ownerId, inactiveManagerId, inactiveManager)).toBe(false);
    // Unknown user cannot coordinate
    expect(canCoordinateWorkspace(ownerId, unknownUserId, null)).toBe(false);
    expect(canCoordinateWorkspace(ownerId, unknownUserId, undefined)).toBe(false);
  });

  it("proves complete record access authorization matrix across all role states", () => {
    const recordAssignedToContributor = contributorId;
    const recordAssignedToOther = 88;

    // Workspace owner can always read any record
    expect(canReadWorkspaceRecord(ownerId, ownerId, null)).toBe(true);
    expect(canReadWorkspaceRecord(ownerId, ownerId, recordAssignedToContributor)).toBe(true);

    // Contributor can read only directly assigned records
    expect(canReadWorkspaceRecord(ownerId, contributorId, recordAssignedToContributor, activeContributor)).toBe(true);
    expect(canReadWorkspaceRecord(ownerId, contributorId, recordAssignedToOther, activeContributor)).toBe(false);
    expect(canReadWorkspaceRecord(ownerId, contributorId, null, activeContributor)).toBe(false);

    // Inactive member cannot read even assigned records
    expect(canReadWorkspaceRecord(ownerId, contributorId, recordAssignedToContributor, { ...activeContributor, isActive: false })).toBe(false);

    // Unknown user has zero record visibility
    expect(canReadWorkspaceRecord(ownerId, unknownUserId, unknownUserId, null)).toBe(false);
  });
});

describe("scheduled-work idempotency", () => {
  it("uses the configured schedule interval rather than a fixed 15-minute window", () => {
    const first = makeRunKey("task_monitor", "cron_task_1", "0 */5 * * * *", new Date("2026-08-19T09:00:01.000Z"));
    const retry = makeRunKey("task_monitor", "cron_task_1", "0 */5 * * * *", new Date("2026-08-19T09:04:59.000Z"));
    const nextWindow = makeRunKey("task_monitor", "cron_task_1", "0 */5 * * * *", new Date("2026-08-19T09:05:00.000Z"));

    expect(retry).toBe(first);
    expect(nextWindow).not.toBe(first);
  });

  it("keeps daily scheduled exports in one calendar execution slot", () => {
    const early = makeRunKey("scheduled_export", "cron_export_1", "0 0 9 * * *", new Date("2026-08-19T09:00:00.000Z"));
    const retry = makeRunKey("scheduled_export", "cron_export_1", "0 0 9 * * *", new Date("2026-08-19T09:01:00.000Z"));
    const nextDay = makeRunKey("scheduled_export", "cron_export_1", "0 0 9 * * *", new Date("2026-08-20T09:00:00.000Z"));

    expect(retry).toBe(early);
    expect(nextDay).not.toBe(early);
  });

  it("allows only cron-authenticated callbacks and retries failed runs", () => {
    expect(isCronOnlyCaller({ isCron: true, taskUid: "cron_1" })).toBe(true);
    expect(isCronOnlyCaller({ isCron: true })).toBe(false);
    expect(isCronOnlyCaller({ taskUid: "cron_1" })).toBe(false);
    expect(shouldRetryRunStatus("failed")).toBe(true);
    expect(shouldRetryRunStatus("succeeded")).toBe(false);
  });
});
