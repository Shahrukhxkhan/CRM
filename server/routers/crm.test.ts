import { describe, expect, it } from "vitest";
import { nextDueDate, normalizeEmail } from "./crm";

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
