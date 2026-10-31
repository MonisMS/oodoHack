import { app } from './app.js';
import { env } from './lib/env.js';
import { db } from './lib/db.js';
import { startBillingScheduler } from './jobs/billing.js';
const scheduler = startBillingScheduler({ enabled: env.BILLING_CRON_ENABLED, expression: env.BILLING_CRON });
// HOST=localhost (the default) means BOTH loopback addresses. Binding only 127.0.0.1 makes every client that resolves
// "localhost" to ::1 first (Windows, Python, some proxies) wait ~2 s for a connection timeout on each request.
// Any other HOST (for example 0.0.0.0 behind a reverse proxy) is used exactly as given.
const hosts = env.HOST === 'localhost' ? ['127.0.0.1', '::1'] : [env.HOST];
const servers = hosts.map(host => {
  const server = app.listen(env.PORT, host, () => console.log(`Brightloop API listening on http://${host.includes(':') ? `[${host}]` : host}:${env.PORT}`));
  server.on('error', (error: NodeJS.ErrnoException) => {
    // A machine without IPv6 simply cannot bind ::1; the IPv4 listener still serves everyone.
    if (host === '::1' && hosts.length > 1 && (error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT')) { console.warn('IPv6 loopback is unavailable; listening on IPv4 only'); return; }
    throw error;
  });
  return server;
});
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {
  const stopped = scheduler?.stop();
  void Promise.all(servers.map(server => new Promise<void>(resolve => { if (server.listening) server.close(() => resolve()); else resolve(); })))
    .then(() => stopped).then(() => db.$disconnect()).then(() => process.exit(0));
});
