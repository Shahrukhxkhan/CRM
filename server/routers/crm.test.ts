import { describe, expect, it } from "vitest";
import { buildAgingBuckets, buildSourceQualityRows, calculateQuoteTotal, mapRawImportRows, nextDueDate, normalizeEmail, quoteStatusSchema, serializeCustomFieldValue } from "./crm";
import { isCronOnlyCaller, makeRunKey, shouldRetryRunStatus } from "../scheduledWork";

describe("CRM duplicate detection", () => {
  it("uses a trimmed, lowercased email as the owner-scoped matching key", () => {
    expect(normalizeEmail("  Ada.Lovelace@Example.COM ")).toBe("ada.lovelace@example.com");
    expect(normalizeEmail(" ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
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
