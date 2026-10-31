import { app } from './app.js';
import { env } from './lib/env.js';
import { db } from './lib/db.js';
const server = app.listen(env.PORT, () => console.log(`Brightloop API listening on http://localhost:${env.PORT}`));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { void db.$disconnect().then(() => process.exit(0)); });
});
