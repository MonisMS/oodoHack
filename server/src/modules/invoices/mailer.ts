import { escapeHtml, sendEmail, type OutgoingEmail } from '../../lib/email.js';

// Invoice and reminder emails. Transport is the shared sender (lib/email.ts): real SMTP when configured, a dev log
// otherwise, an honest failure in production without SMTP. Kept as an object so tests can observe/replace `send`.
export type { OutgoingEmail };
export const invoiceMailer = {
  send: (message: OutgoingEmail): Promise<void> => sendEmail(message),
};

export interface InvoiceEmailData {
  number: string; customerName: string; customerEmail: string; issueDate: string; dueDate: string; total: string; amountPaid: string; outstanding: string; currency: string;
  lines: Array<{ description: string; quantity: number; unitPrice: string; total: string }>;
}

/** Built only from frozen invoice values; every dynamic value is HTML-escaped. */
export function renderInvoiceEmail(i: InvoiceEmailData): OutgoingEmail {
  const rows = i.lines.map(l => `<tr><td>${escapeHtml(l.description)}</td><td>${l.quantity}</td><td>${escapeHtml(l.unitPrice)}</td><td>${escapeHtml(l.total)}</td></tr>`).join('');
  const html = `<h2>Invoice ${escapeHtml(i.number)}</h2><p>Hello ${escapeHtml(i.customerName)},</p>`
    + `<p>Issued ${escapeHtml(i.issueDate)} &middot; due ${escapeHtml(i.dueDate)}.</p>`
    + `<table border="1" cellpadding="6" cellspacing="0"><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>${rows}</table>`
    + `<p><strong>Total ${escapeHtml(i.currency)} ${escapeHtml(i.total)}</strong> &middot; paid ${escapeHtml(i.amountPaid)} &middot; outstanding ${escapeHtml(i.outstanding)}</p>`;
  return { to: i.customerEmail, subject: `Invoice ${i.number} from Brightloop`, html };
}

/** Polite payment reminder for an overdue invoice; built from frozen values, every dynamic value escaped. */
export function renderReminderEmail(i: { number: string; customerName: string; customerEmail: string; dueDate: string; outstanding: string; currency: string; daysOverdue: number }): OutgoingEmail {
  const html = `<h2>Payment reminder: invoice ${escapeHtml(i.number)}</h2><p>Hello ${escapeHtml(i.customerName)},</p>`
    + `<p>Our records show invoice ${escapeHtml(i.number)} was due on ${escapeHtml(i.dueDate)} and is now ${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue.</p>`
    + `<p><strong>Outstanding: ${escapeHtml(i.currency)} ${escapeHtml(i.outstanding)}</strong></p><p>If you have already paid, please ignore this message.</p>`;
  return { to: i.customerEmail, subject: `Reminder: invoice ${i.number} is overdue`, html };
}

