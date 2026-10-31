import { invariant } from "./errors.js";
import { addMinor, fromMinor, lineSubtotal, toMinor } from "./money.js";

export interface PriceInput {
  salesPrice: string;
  variantExtraPrice?: string;
  unitPrice?: string;
}

/** An explicit unitPrice is already the final effective price. */
export function resolveUnitPrice(input: PriceInput): string {
  const amount =
    input.unitPrice === undefined
      ? addMinor(
          toMinor(input.salesPrice),
          toMinor(input.variantExtraPrice ?? "0.00"),
        )
      : toMinor(input.unitPrice);
  invariant(
    amount >= 0,
    "INVALID_MONEY",
    "Effective unit price cannot be negative",
  );
  return fromMinor(amount);
}

export function priceLine(input: PriceInput & { quantity: number }): {
  unitPrice: string;
  subtotal: string;
} {
  const unitPrice = resolveUnitPrice(input);
  return {
    unitPrice,
    subtotal: fromMinor(lineSubtotal(toMinor(unitPrice), input.quantity)),
  };
}
