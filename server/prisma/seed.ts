import 'dotenv/config';
import { db } from '../src/lib/db.js';
import { runSeed } from '../src/seed/run.js';

// Idempotent demo data. `npm run db:seed` seeds the demo set; `npm run db:seed -- --perf` adds ~300 customers and ~5,000
// subscriptions with consistent invoices and payments (disposable local database only). Options: --subs=N --customers=N.
// Never truncates or deletes anything, and refuses to run when NODE_ENV=production.
const args = process.argv.slice(2);
const number = (name: string) => { const hit = args.find(a => a.startsWith(`--${name}=`)); return hit ? Number(hit.split('=')[1]) : undefined; };
const started = Date.now();
runSeed(db, { perf: args.includes('--perf'), subscriptions: number('subs'), customers: number('customers'), log: m => console.log(`[seed] ${m}`) })
  .then(summary => console.log(`[seed] done in ${((Date.now() - started) / 1000).toFixed(1)}s`, summary))
  .catch(error => { console.error('[seed] failed:', error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
