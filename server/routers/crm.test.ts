import { describe, expect, it } from "vitest";
import { buildAgingBuckets, buildContact360ActivityTimeline, buildContact360Summary, buildSourceQualityRows, calculateCommercialLine, calculateCommercialSummary, calculateQuoteTotal, canActivateCalendarAutomation, canAssignWorkspaceUser, canCoordinateWorkspace, classifyImportRows, isContact360StandardActivityType, isValidReportRange, mapRawImportRows, nextDueDate, normalizeEmail, parseSavedViewConfig, quoteStatusSchema, resolveLeadSource, serializeCustomFieldValue, sortGlobalSearchResults } from "./crm";
import { isCronOnlyCaller, makeRunKey, shouldRetryRunStatus } from "../scheduledWork";

describe("CRM duplicate detection", () => {
  it("uses a trimmed, lowercased email as the owner-scoped matching key", () => {
    expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe("ada.lovelace@example.com");
    expect(normalizeEmail(" ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
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

  it("flags duplicate normalized emails within a mapped CSV before any contact write", () => {
    const rows = classifyImportRows([
      { rowNumber: 2, firstName: "Ada", lastName: "Lovelace", email: "ADA@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
      { rowNumber: 3, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "", jobTitle: "", leadSource: "Referral", relationshipStage: "Lead" },
    ], "create", new Map());

    expect(rows[1]).toMatchObject({ action: "error", errorMessage: "Duplicate email appears more than once in this CSV." });
  });
});

describe("CRM reporting", () => {
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
    ]));

    expect(rows).toEqual([
      expect.objectContaining({ source: "Event", contactToDealConversion: 33, dealWinConversion: 0 }),
      expect.objectContaining({ source: "Referral", contactToDealConversion: 50, dealWinConversion: 75 }),
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

  it("rolls quote lines into subtotal, discount, tax, and grand total snapshots", () => {
    expect(calculateCommercialSummary([{ quantity: 2, unitAmount: 100, discountPercent: 10, taxPercent: 0 }, { quantity: 1, unitAmount: 50, discountPercent: 0, taxPercent: 20 }])).toEqual({ subtotal: 250, discountAmount: 20, taxAmount: 10, total: 240 });
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
  it("accepts only structured filters, sorting, columns, and grouping preferences", () => {
    expect(parseSavedViewConfig(JSON.stringify({ filters: { priority: "urgent" }, sort: { field: "dueAt", direction: "asc" }, columns: ["title", "priority"], groupBy: "priority" }))).toMatchObject({ filters: { priority: "urgent" }, sort: { field: "dueAt", direction: "asc" }, groupBy: "priority" });
    expect(() => parseSavedViewConfig(JSON.stringify({ filters: { nested: { unsupported: true } }, sort: { field: "dueAt", direction: "up" }, columns: [] }))).toThrow();
  });

  it("orders mixed owner-scoped search results by recency and honors the requested limit", () => {
    const records = sortGlobalSearchResults([
      { id: "contact-1", occurredAt: new Date("2026-08-20T00:00:00.000Z") },
      { id: "deal-2", occurredAt: new Date("2026-08-23T00:00:00.000Z") },
      { id: "task-3", occurredAt: new Date("2026-08-22T00:00:00.000Z") },
    ], 2);
    expect(records.map(record => record.id)).toEqual(["deal-2", "task-3"]);
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
