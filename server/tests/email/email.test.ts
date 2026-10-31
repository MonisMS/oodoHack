import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, htmlToText, renderPasswordResetEmail, sendEmail, smtpOptions } from '../../src/lib/email.js';

describe('email transport (D-02)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); });
  const message = { to: 'customer@example.com', subject: 'Hello', html: '<p>Hi <a href="https://x.test/a?b=1&amp;c=2">link</a></p>' };

  it('sends through the transport with the configured sender, HTML and a plain-text alternative', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await sendEmail(message, { transport: { sendMail } });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = sendMail.mock.calls[0]![0];
    expect(sent).toMatchObject({ to: 'customer@example.com', subject: 'Hello', html: message.html });
    expect(sent.from).toContain('billing@brightloop.local');
    expect(sent.text).toBe('Hi link (https://x.test/a?b=1&c=2)');
  });

  it('produces a real MIME message through nodemailer (json transport)', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const captured: string[] = [];
    await sendEmail(message, { transport: { sendMail: async (m: Parameters<typeof transport.sendMail>[0]) => { const info = await transport.sendMail(m); captured.push(info.message as string); return info; } } as never });
    const mime = JSON.parse(captured[0]!);
    expect(mime).toMatchObject({ subject: 'Hello', html: message.html }); expect(mime.to).toEqual([{ address: 'customer@example.com', name: '' }]);
  });

  it('logs instead of sending in development without SMTP, so reset links stay visible', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(sendEmail(message, { transport: null })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1); expect(String(log.mock.calls[0]![0])).toContain('[dev email] to=customer@example.com');
  });

  it('fails in production when no transport is configured, instead of pretending it was sent', async () => {
    vi.resetModules(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEV_AUTH_ENABLED', 'false'); vi.stubEnv('BETTER_AUTH_SECRET', 'p'.repeat(40));
    const { sendEmail: prodSend } = await import('../../src/lib/email.js');
    await expect(prodSend(message, { transport: null })).rejects.toThrow(/not configured/);
  });

  it('refuses header injection through the recipient or subject', async () => {
    const sendMail = vi.fn();
    await expect(sendEmail({ ...message, to: 'a@b.c\r\nBcc: attacker@evil.test' }, { transport: { sendMail } })).rejects.toThrow(/line break/);
    await expect(sendEmail({ ...message, subject: 'Hi\nBcc: attacker@evil.test' }, { transport: { sendMail } })).rejects.toThrow(/line break/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('builds SMTP options from the environment (none when unset, implicit TLS on 465, auth when a user is set)', () => {
    expect(smtpOptions({ port: 587 })).toBeNull();
    expect(smtpOptions({ host: 'smtp.example.com', port: 587 })).toEqual({ host: 'smtp.example.com', port: 587, secure: false });
    expect(smtpOptions({ host: 'smtp.example.com', port: 465, user: 'u', pass: 'p' })).toEqual({ host: 'smtp.example.com', port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
  });

  it('renders the password reset email with the link and escapes everything dynamic', () => {
    const mail = renderPasswordResetEmail({ name: '<script>alert(1)</script> "Q"', url: 'https://app.test/reset?token=abc&x=<1>' });
    expect(mail.subject).toBe('Reset your Brightloop password');
    expect(mail.html).toContain('href="https://app.test/reset?token=abc&amp;x=&lt;1&gt;"');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;Q&quot;'); expect(mail.html).not.toContain('<script>');
    expect(mail.html).toMatch(/expires in 30 minutes/);
  });

  it('escapes HTML metacharacters and converts markup to readable text', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(htmlToText('<h2>Title</h2><p>One &amp; two</p><p>Next</p>')).toBe('Title\nOne & two\nNext');
  });
});
