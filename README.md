# Brightloop Software — Subscription Management

Foundation for a four-person hackathon team. React + Vite + TypeScript + Tailwind + React Router + TanStack Query + Recharts; Express + TypeScript + Zod + JWT/bcrypt; local PostgreSQL + Prisma. `/client` and `/server` are npm workspaces. The alternate Next.js/Neon team plan was not applied: this deliverable follows the requested foundation-only scope and fixed stack.

## What works now

Complete Prisma schema + generated initial SQL migration, every API route/validator/role contract, development identity adapter, error middleware, transactional numbering helper, responsive sidebar/role-nav, typed fetch client, route registry and feature page scaffolds. `/api/health` works without a database. Feature endpoints return 501 after role and input validation. Authentication, billing, catalog CRUD, payments, reporting, email and seed data remain the assigned workstreams. No fake data or partially working business features are presented as complete.

Read [API_CONTRACT.md](API_CONTRACT.md) and [TASKS.md](TASKS.md) before implementing. Their business decisions are deliberate shared contracts. This README is the ownership authority for this React/Express foundation.

## Local setup (WSL recommended)

Use Node 22.12+ (Node 22 via `.nvmrc`), npm 10+, PostgreSQL 16+ installed locally. The scaffold pins Prisma 7.10.1 on CLI, client and PostgreSQL adapter; upgrade them together. Prisma CLI configuration is in server/prisma.config.ts; generate and validate work before a DB exists. No Firebase, Supabase, Neon or remote database is needed. Installation is from the root:

```bash
cd /home/monis/oodoHack
nvm install
nvm use
npm ci
cp .env.example server/.env
cp client/.env.example client/.env
```

Create a local database once (Ubuntu packages shown; sudo may prompt). Use different names/credentials for personal/test databases and adjust server/.env. These are development example credentials, not production secrets.

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER brightloop WITH PASSWORD 'brightloop';"
sudo -u postgres psql -c 'CREATE DATABASE brightloop OWNER brightloop;'
# Required by prisma migrate dev's shadow database on personal local DBs only:
sudo -u postgres psql -c 'ALTER USER brightloop CREATEDB;'
```

Then generate, migrate, and run:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Web: http://localhost:5173. API health: http://localhost:4000/api/health. Vite proxies `/api` to Express; production needs an equivalent same-origin reverse proxy. Seed is intentionally a no-write stub until D implements it, so no demo logins exist yet. Migrations do not run automatically at startup. For an already-provisioned database without shadow permissions use `npm run db:deploy` to apply committed migrations. Never use reset/push against a teammate's database.

`server/.env` is loaded relative to the server workspace by dotenv; npm workspace scripts set that directory. Frontend env values are public: never put JWT_SECRET, SMTP credentials or DATABASE_URL in client env. API environment variables are listed in root .env.example. Client `.env.example` provides VITE_API_BASE_URL and explicit development-auth flag. Default JWT strategy is Bearer; C must verify signature, expiry and active user. Development headers are a temporary opt-in and are rejected if NODE_ENV=production. Keep the API on a trusted local machine until C finishes auth. The shell's dev identity UUID is only an identity fixture, not a seeded DB user; replace/select a real seed user for business operations.

## Commands

| Command | Purpose |
|---|---|
| npm run dev | Express+Vite watch processes |
| npm run typecheck | Both workspaces, including foundation tests/seed |
| npm test | Foundation API/input boundary tests (no PostgreSQL needed) |
| npm run build | Server TS emit + browser production bundle |
| npm run db:generate | Prisma client generation |
| npm run db:migrate | Apply committed migrations; create dev migrations only as A |
| npm run db:deploy | Apply committed migrations without shadow database |
| npm run db:seed | D-owned seed entry point (currently no-write stub) |
| npm run db:validate -w server | Validate the frozen Prisma schema |
| npm run start -w server | Compiled API; use only after setting NODE_ENV/auth correctly |

## Architecture and extension points

```text
React feature pages → typed fetch + TanStack Query → /api/<module>
Express registry → requireAuth/requireRole → Zod validate → controller → service
                                                           ↓
                                                    shared Prisma → local PostgreSQL
Cron (A, pending) ─────────────────────────────────→ billing service transaction
```

- Server modules: `server/src/modules/<module>/{routes.ts,controller.ts,service.ts,schemas.ts}`. Controllers read parsed data from `res.locals.validated`, not raw request values. Central validators in `server/src/lib/contracts.ts` are frozen and re-exported by module schemas. Owners may extend module files with noncontract helpers; changing input shapes requires A.
- Client modules: `client/src/modules/<module>/{pages/,components/,api.ts,routes.tsx}`. Export `routes` once; shared `client/src/routes.tsx` already imports them. Each owner edits only their module's routes. Client API DTOs live in `client/src/types/api.ts`, never infer wire types from a raw Prisma model.
- `server/src/modules/index.ts` already mounts every module once; billing-engine owns `/api/billing`. No need to edit shared registries for existing routes. For a new module ask A to add one import/mount.
- Client modules use their own API files and may import shared public UI exports. Server modules use only another module's service.ts public exports; do not import private internals. Reports may directly read db with SQL aggregates. Never put Prisma on the client.
- A's `nextNumber(tx,prefix,year)` uses Counter upsert/increment in the caller's transaction. Financial code must not call it outside its transaction or derive numbers from counts.

## Folder ownership — strict

| Paths | Owner |
|---|---|
| Root configs/package/lockfile, .env.example, README.md, TASKS.md; server/prisma.config.ts, server/prisma/schema.prisma + migrations; API_CONTRACT.md; client/src/types/api.ts | A |
| server/src/lib/**, middleware except auth.ts, app.ts/index.ts, server/src/modules/index.ts; client/src/lib/** except session.tsx; config/**; components/layout/**; routes.tsx/main.tsx/styles.css | A |
| server+client modules subscriptions, quotation-templates, invoices, billing-engine, taxes, discounts | A |
| server+client modules products, plans | B |
| client/src/components/ui/** | A creates base; B owns new UI files after foundation freeze. Existing PageHeader.tsx and EmptyState.tsx remain A-owned; request A changes. This resolves the shared-folder/kit ownership overlap. |
| server+client modules auth, users, portal; server/src/middleware/auth.ts; client/src/lib/session.tsx | C (explicit adapter handoff after scaffold) |
| server+client modules payments, reports; server/prisma/seed.ts, seed-data/**, tests/payments/**, tests/reports/**, DEMO.md | D (seed stub handoff after scaffold) |
| server/tests/foundation.test.ts and future tests for A modules | A |
| Tests under each owned server module; tests/catalog/** / tests/auth/** | Module owner / B / C |
| docs/status/A.md / B.md / C.md / D.md | Respective person only |

Shared folders `server/src/lib`, `client/src/lib`, `client/src/components/ui` are owned by A except explicit transfers above. Others may ADD new helper files; never edit an existing shared file without ownership transfer. Dependency changes go through A because the root lockfile is shared. D requests faker, C may request a rate-limit package. Avoid parallel npm install commits that collide in package-lock.json. Documentation/schema requests go to A in team chat; do not edit another person's folder.

## Git and integration rules

Branches: `feat/A-billing`, `feat/B-catalog`, `feat/C-auth`, `feat/D-reports`. Small focused commits every 30–45 min, each member from their own GitHub account. PRs into main; A reviews/merges. Codex-created branches default to `codex/` except the above user-requested team names. Initial foundation is committed on main because the repository begins empty; share/tag foundation-v1 after checks pass. Never impersonate another member's identity.

After foundation-v1, only A changes schema.prisma or API_CONTRACT.md. If B/C/D need a field, ask A; A adds migration and pushes, others pull and run `npm run db:migrate`. Never commit .env or DB dumps. Every member uses their own LOCAL PostgreSQL DB. No cloud database substitution.

Checkpoints 11:30, 13:30, 15:30 IST: pull main, migrate, seed, run typecheck/tests/build and demo smoke test. Feature freeze 16:15; bug fixes only until 16:45; record video at 16:45; code freeze 17:00, video submission 17:30. These are planning times, shifted together if kickoff/deadline changes. A has a 40-minute pre-freeze integration reserve. Test only against disposable/local data, especially later concurrency and performance tests.

Billing is disabled until A implements transactions and node-cron. Do not remove the explicit scheduler startup refusal until real job wiring exists. Email delivery is implemented by feature owners later; development fallback logs may include reset links, so never use them in production. Tasks, dependencies, acceptance priorities and cut list are in TASKS.md.
