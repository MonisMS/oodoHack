import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env.js';

// The single outbound-email entry point (D-02). Everything that emails (password reset, invoices, reminders) goes through
// `sendEmail`, so transport, dev logging and safety checks live in one place.
export interface OutgoingEmail { to: string; subject: string; html: string }
type MailTransport = Pick<Transporter, 'sendMail'>;

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Plain-text alternative derived from the HTML (improves deliverability; keeps links readable). */
export function htmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|h\d|tr|div)>|<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Nodemailer options from the environment, or null when SMTP is not configured. Port 465 implies implicit TLS. */
export function smtpOptions(config: { host?: string; port: number; user?: string; pass?: string } = { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS }) {
  if (!config.host) return null;
  return { host: config.host, port: config.port, secure: config.port === 465, ...(config.user ? { auth: { user: config.user, pass: config.pass ?? '' } } : {}) };
}

let shared: MailTransport | null | undefined;
function defaultTransport(): MailTransport | null {
  if (shared === undefined) { const options = smtpOptions(); shared = options ? nodemailer.createTransport(options) : null; }
  return shared;
}

/**
 * Sends one email. With SMTP configured it is really sent; in development without SMTP the message is logged (so reset
 * links are visible); in production without SMTP it FAILS, so no caller can believe an email went out when it did not.
 * Header injection is refused: recipient and subject must be single-line.
 */
export async function sendEmail(message: OutgoingEmail, options: { transport?: MailTransport | null } = {}): Promise<void> {
  if (/[\r\n]/.test(message.to) || /[\r\n]/.test(message.subject)) throw new Error('Refusing to send an email with a line break in the recipient or subject');
  const transport = options.transport === undefined ? defaultTransport() : options.transport;
  if (!transport) {
    if (env.NODE_ENV === 'production') throw new Error('Email transport is not configured (set SMTP_HOST)');
    console.log(`[dev email] to=${message.to} subject="${message.subject}"\n${htmlToText(message.html)}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: htmlToText(message.html) });
}

/** Password reset message. Built only from the reset URL and the user's name; both are escaped. */
export function renderPasswordResetEmail(input: { name: string; url: string }): Omit<OutgoingEmail, 'to'> {
  const url = escapeHtml(input.url);
  const html = `<h2>Reset your Brightloop password</h2><p>Hello ${escapeHtml(input.name)},</p>`
    + `<p>We received a request to reset your password. This link works once and expires in 30 minutes:</p>`
    + `<p><a href="${url}">Reset my password</a></p><p>${url}</p>`
    + `<p>If you did not ask for this, you can ignore this email; your password stays unchanged.</p>`;
  return { subject: 'Reset your Brightloop password', html };
}
