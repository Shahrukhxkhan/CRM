import { describe, expect, it } from "vitest";
import { belongsToOwner } from "./access";
import { recordNotFound } from "./errors";
import { buildDashboardSummary, completionTimestamp, newestActivitiesFirst } from "./logic";
import { contactInputSchema } from "./validation";

describe("CRM ownership and lifecycle logic", () => {
  it("allows only the authenticated owner to act on a record", () => {
    expect(belongsToOwner(42, 42)).toBe(true);
    expect(belongsToOwner(42, 7)).toBe(false);
  });

  it("accepts only the six default contact pipeline stages", () => {
    expect(contactInputSchema.safeParse({ name: "Avery", stage: "qualified" }).success).toBe(true);
    expect(contactInputSchema.safeParse({ name: "Avery", stage: "custom-stage" }).success).toBe(false);
  });

  it("accepts the minimal contact payload used to create a new lead", () => {
    const result = contactInputSchema.safeParse({ name: "Jordan Lee" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Jordan Lee");
  });

  it("orders contact activities newest first and breaks ties predictably", () => {
    const sameTime = new Date("2026-08-10T10:00:00.000Z");
    const ordered = newestActivitiesFirst([
      { id: 1, occurredAt: new Date("2026-08-09T10:00:00.000Z") },
      { id: 2, occurredAt: sameTime },
      { id: 3, occurredAt: sameTime },
    ]);
    expect(ordered.map(activity => activity.id)).toEqual([3, 2, 1]);
  });

  it("sets and clears completion timestamps for follow-up lifecycle changes", () => {
    const now = new Date("2026-08-15T10:00:00.000Z");
    expect(completionTimestamp(true, now)).toEqual(now);
    expect(completionTimestamp(false, now)).toBeNull();
  });

  it("keeps dashboard metric and activity collections aligned", () => {
    const result = buildDashboardSummary({
      openLeadCount: 4,
      pipelineValue: "4200.00",
      overdueFollowUpCount: 2,
      pendingQuoteCount: 1,
      stageSummary: [{ stage: "qualified", count: 4, value: "4200.00" }],
      recentActivities: [{ id: 9 }],
      actionQueue: [{ id: 11 }],
    });

    expect(result.metrics).toEqual({ openLeadCount: 4, pipelineValue: "4200.00", overdueFollowUpCount: 2, pendingQuoteCount: 1 });
    expect(result.stageSummary).toEqual([{ stage: "qualified", count: 4, value: "4200.00" }]);
    expect(result.recentActivities).toEqual([{ id: 9 }]);
    expect(result.actionQueue).toEqual([{ id: 11 }]);
  });

  it("returns a safe missing-record error without disclosing ownership details", () => {
    expect(() => recordNotFound("Contact")).toThrow("Contact was not found or is not available to you.");
  });
});
