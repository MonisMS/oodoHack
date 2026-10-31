import { app } from './app.js';
import { env } from './lib/env.js';
import { db } from './lib/db.js';
import { startBillingScheduler } from './jobs/billing.js';
const scheduler = startBillingScheduler({ enabled: env.BILLING_CRON_ENABLED, expression: env.BILLING_CRON });
const server = app.listen(env.PORT, () => console.log(`Brightloop API listening on http://localhost:${env.PORT}`));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {
  const stopped = scheduler?.stop();
  server.close(() => { void Promise.resolve(stopped).then(() => db.$disconnect()).then(() => process.exit(0)); });
});
