import type { InvoiceStatus } from '@prisma/client';
// Preserve A's public administrative-action interface, using B's canonical policy.
export { canTransitionInvoice } from '../../lib/domain/states.js';
export type TransitionCheck = { ok: true } | { ok: false; reason: string };
export const canSend = (status: InvoiceStatus) => status === 'CONFIRMED' || status === 'PARTIALLY_PAID' || status === 'PAID';
