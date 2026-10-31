import { env } from '../../lib/env.js';

// Transport + fallback renderer for invoice email. D-02 supplies the real SMTP sender and HTML renderer;
// until then this keeps `send` honest: dev logs the message, production fails instead of pretending it was sent.
export interface OutgoingEmail { to: string; subject: string; html: string }

export const invoiceMailer = {
  send: async (message: OutgoingEmail): Promise<void> => {
    if (env.NODE_ENV === 'production') throw new Error('Invoice email transport is not configured');
    console.log(`[dev email] to=${message.to} subject="${message.subject}"\n${message.html}`);
  },
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

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

