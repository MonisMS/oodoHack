import type { InvoiceStatus } from '@prisma/client';

// STAND-IN for B's lib/domain/states.ts `canTransitionInvoice` (B-05); same signature as docs/A-01-agreements.md.
// Encodes the contract: DRAFT -> CONFIRMED | CANCELLED; CONFIRMED -> CANCELLED only without payments;
// payments (not this table) move CONFIRMED -> PARTIALLY_PAID -> PAID; nothing leaves PAID or CANCELLED.
export type TransitionCheck = { ok: true } | { ok: false; reason: string };
const no = (reason: string): TransitionCheck => ({ ok: false, reason });

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus, ctx: { paymentCount: number }): TransitionCheck {
  if (from === to) return no(`Invoice is already ${from}`);
  if (from === 'PAID' || from === 'CANCELLED') return no(`A ${from} invoice cannot change status`);
  if (from === 'DRAFT' && (to === 'CONFIRMED' || to === 'CANCELLED')) return { ok: true };
  if (from === 'CONFIRMED' && to === 'CANCELLED') return ctx.paymentCount === 0 ? { ok: true } : no('An invoice with payments cannot be cancelled');
  if (from === 'PARTIALLY_PAID' && to === 'CANCELLED') return no('An invoice with payments cannot be cancelled');
  return no(`Cannot move an invoice from ${from} to ${to}`);
}

/** Sending is only meaningful once the invoice is a real, issued document. */
export const canSend = (status: InvoiceStatus) => status === 'CONFIRMED' || status === 'PARTIALLY_PAID' || status === 'PAID';
