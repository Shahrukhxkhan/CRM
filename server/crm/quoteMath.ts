export type QuoteCalculationItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type CalculatedQuoteItem = QuoteCalculationItem & {
  lineTotal: string;
};

function toScaledInteger(value: number, scale: number): number {
  return Math.round((value + Number.EPSILON) * scale);
}

/**
 * Calculates monetary values on the server in integer cents so browser totals are never authoritative.
 */
export function calculateQuoteTotals(items: QuoteCalculationItem[]) {
  const calculatedItems: CalculatedQuoteItem[] = [];
  let subtotalCents = 0;

  for (const item of items) {
    const quantityHundredths = toScaledInteger(item.quantity, 100);
    const unitPriceCents = toScaledInteger(item.unitPrice, 100);
    const lineCents = Math.round((quantityHundredths * unitPriceCents) / 100);
    subtotalCents += lineCents;
    calculatedItems.push({ ...item, lineTotal: (lineCents / 100).toFixed(2) });
  }

  return {
    items: calculatedItems,
    subtotal: (subtotalCents / 100).toFixed(2),
    total: (subtotalCents / 100).toFixed(2),
  };
}

export function toMoneyString(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return (toScaledInteger(value, 100) / 100).toFixed(2);
}
