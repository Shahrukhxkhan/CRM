import { describe, expect, it } from "vitest";
import { CONTACT_CSV_HEADERS, MAX_CONTACT_CSV_BYTES, createContactCsv, parseContactCsv } from "./csv";

describe("contact CSV helpers", () => {
  it("parses valid quoted fields, tags, pipeline stages, and numeric values", () => {
    const csv = `${CONTACT_CSV_HEADERS.join(",")}\r\n"Jordan Lee","jordan@example.com","555-0100","Northstar, Inc.","Referral","1250.50","qualified","priority;design","Asked for a proposal"`;
    const result = parseContactCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{
      name: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-0100",
      companyName: "Northstar, Inc.",
      source: "Referral",
      estimatedValue: 1250.5,
      stage: "qualified",
      tags: ["priority", "design"],
      notes: "Asked for a proposal",
    }]);
  });

  it("reports invalid rows while preserving the valid parse result for an all-or-nothing import decision", () => {
    const csv = `name,email,estimated_value,stage\nMorgan,morgan@example.com,250,new\nJordan,jordan@example.com,-5,new\nAvery,not-an-email,20,qualified`;
    const result = parseContactCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map(error => error.row)).toEqual([3, 4]);
  });

  it("rejects an oversized import before parsing rows", () => {
    const result = parseContactCsv(`name\n${"A".repeat(MAX_CONTACT_CSV_BYTES)}`);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain("1 MB");
  });

  it("formats a stable export with escaped quotes and semicolon-delimited tags", () => {
    const result = createContactCsv([{
      name: "Jordan \"J" + "\" Lee",
      email: "jordan@example.com",
      phone: null,
      company: "Northstar, Inc.",
      source: null,
      estimatedValue: "99.50",
      stage: "new",
      tags: ["priority", "inbound"],
      notes: "First call",
    }]);
    expect(result.split("\r\n")[0]).toBe(CONTACT_CSV_HEADERS.join(","));
    expect(result).toContain('"Jordan ""J"" Lee"');
    expect(result).toContain('"priority;inbound"');
  });
});
