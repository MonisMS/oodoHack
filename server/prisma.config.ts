import 'dotenv/config';
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // A harmless local default lets generate/validate work before .env is copied.
  datasource: { url: process.env.DATABASE_URL || 'postgresql://brightloop:brightloop@localhost:5432/brightloop?schema=public' },
});
