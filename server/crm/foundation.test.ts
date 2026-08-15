import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { calculateQuoteTotals } from "./quoteMath";
import { contactInputSchema, quoteInputSchema } from "./validation";

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("CRM protected API foundation", () => {
  it("rejects unauthenticated contact access", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.contacts.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects malformed contact email and a negative estimated value", () => {
    const result = contactInputSchema.safeParse({
      name: "Avery Chen",
      email: "not-an-email",
      estimatedValue: -1,
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one valid quote item", () => {
    const result = quoteInputSchema.safeParse({ contactId: 1, title: "Design proposal", items: [] });
    expect(result.success).toBe(false);
  });

  it("calculates quote totals on the server with cents precision", () => {
    const result = calculateQuoteTotals([
      { description: "Workshop", quantity: 1, unitPrice: 1250 },
      { description: "Implementation", quantity: 2.5, unitPrice: 225.4 },
    ]);

    expect(result.items.map(item => item.lineTotal)).toEqual(["1250.00", "563.50"]);
    expect(result.subtotal).toBe("1813.50");
    expect(result.total).toBe("1813.50");
  });
});
