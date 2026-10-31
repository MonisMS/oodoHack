# Brightloop Software — Subscription Management

Foundation for a four-person hackathon team. React + Vite + TypeScript + Tailwind + React Router + TanStack Query + Recharts; Express + TypeScript + Zod + JWT/bcrypt; local PostgreSQL + Prisma. `/client` and `/server` are npm workspaces. The alternate Next.js/Neon team plan was not applied: this deliverable follows the requested foundation-only scope and fixed stack.

## What works now

Complete Prisma schema + generated initial SQL migration, every API route/validator/role contract, development identity adapter, error middleware, transactional numbering helper, responsive sidebar/role-nav, typed fetch client, route registry and feature page scaffolds. `/api/health` works without a database. Feature endpoints return 501 after role and input validation. Authentication, billing, catalog CRUD, payments, reporting, email and seed data remain the assigned workstreams. No fake data or partially working business features are presented as complete.

Read [API_CONTRACT.md](API_CONTRACT.md) and [TASKS.md](TASKS.md) before implementing. Their business decisions are deliberate shared contracts. The rebalanced ownership table in TASKS.md (mirrored in docs/TEAM_PLAN.md) is authoritative. All four members have Codex: Lead/A 35%, Monis/B 30%, Adit Chobe/C 18%, Ansh/D 17%. A/B retain critical backend decisions; C/D own substantial specified implementation work.

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

`server/.env` is loaded relative to the server workspace by dotenv; npm workspace scripts set that directory. Frontend env values are public: never put JWT_SECRET, SMTP credentials or DATABASE_URL in client env. API environment variables are listed in root .env.example. Client `.env.example` provides VITE_API_BASE_URL and explicit development-auth flag. Default JWT strategy is Bearer; A owns verification of signature, expiry and active user; C owns the public auth forms. Development headers are a temporary opt-in and are rejected if NODE_ENV=production. Keep the API on a trusted local machine until A finishes real auth. The shell's dev identity UUID is only an identity fixture, not a seeded DB user; replace/select a real seed user for business operations.

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
Cron (B, pending) ─────────────────────────────────→ billing service transaction
```

- Server modules: `server/src/modules/<module>/{routes.ts,controller.ts,service.ts,schemas.ts}`. Controllers read parsed data from `res.locals.validated`, not raw request values. Central validators in `server/src/lib/contracts.ts` are frozen and re-exported by module schemas. Owners may extend module files with noncontract helpers; changing input shapes requires A.
- Client modules: `client/src/modules/<module>/{pages/,components/,api.ts,routes.tsx}`. Export `routes` once; shared `client/src/routes.tsx` already imports them. Each owner edits only their module's routes. Client API DTOs live in `client/src/types/api.ts`, never infer wire types from a raw Prisma model.
- `server/src/modules/index.ts` already mounts every module once; billing-engine owns `/api/billing`. No need to edit shared registries for existing routes. For a new module ask A to add one import/mount.
- Client modules use their own API files and may import shared public UI exports. Server modules use only another module's service.ts public exports; do not import private internals. Reports may directly read db with SQL aggregates. Never put Prisma on the client.
- A's `nextNumber(tx,prefix,year)` uses Counter upsert/increment in the caller's transaction. Financial code must not call it outside its transaction or derive numbers from counts.

## File ownership — explicit transfer, no overlaps

Server and client ownership are intentionally different: A/B build critical services while C/D build the labor-intensive screens. This table supersedes old owner comments in scaffold files and the previous unnamed A/B/C/D map. Application behavior/contracts stay unchanged. Nobody edits another person's existing file without an explicit transfer.

| Paths | Owner |
|---|---|
| Root manifests/lockfile/env/config; schema/migrations/prisma.config; API_CONTRACT.md; client/src/types/api.ts; README/TASKS/TEAM_PLAN | A, with B consulted on financial changes |
| server/src/lib/** except domain/** and email.ts; middleware/**; app.ts/index.ts; server module registry; client core lib/session/API/route registry/nav/layout/styles | A |
| server/src/modules/{auth,users,subscriptions,quotation-templates,invoices,payments}/** | A |
| server/src/lib/domain/**; server/src/modules/billing-engine/**; server/src/jobs/billing.ts; server/tests/{domain,billing}/** | B; A assumes urgent maintenance after the 12:30 handoff |
| server/src/modules/{products,plans,discounts,reports}/**; server/tests/{catalog,reports}/** | C |
| client/src/modules/{products,plans,discounts,reports,auth,users}/**; client/src/components/ui/** | C; existing PageHeader/EmptyState ownership transferred, public props preserved |
| server/src/modules/{taxes,portal}/**; server/src/lib/email.ts; server/prisma/seed.ts and seed-data/**; server/tests/{taxes,portal,seed}/** | D; A reviews portal ownership predicates and email integration |
| client/src/modules/{subscriptions,quotation-templates,invoices,billing-engine,payments,portal,taxes}/**; DEMO.md; QA.md | D |
| server/tests/foundation.test.ts; server/tests/{auth,subscriptions,invoices,payments}/** | A |
| Client tests inside an owned module; docs/status/A.md, B.md, C.md, D.md | Module owner; corresponding person only |

Only A changes shared dependency manifests/lockfile and existing core shared files. Others may add helper files within their owned paths. B's domain directory, D's email file and C's UI kit are explicit shared-folder ownership exceptions. Requests for a new module mount, session/route interface, package, field or validator go to A. The central server input validators remain A-owned; module schemas.ts re-export them.

## Git and integration rules

Branches: `feat/A-core` (Lead), `feat/B-domain-billing` (Monis), `feat/C-catalog-reporting` (Adit Chobe), `feat/D-operations-ui` (Ansh). All four have Codex and commit from their own GitHub accounts every 30–45 min. A reviews/merges integration changes; A/B retain financial/security decision authority. C/D own their specified implementations and fixes. Keep this repository local until publication is explicitly authorized; sharing a plan does not authorize pushing. Initial foundation tag is foundation-v1; current task ownership supersedes older scaffold owner comments without changing endpoint contracts.

After foundation-v1, only A edits schema.prisma or API_CONTRACT.md, consulting B on financial policy. If B/C/D need a field, ask A; A adds a migration and shares it through the authorized Git workflow, others run `npm run db:migrate`. Never commit .env or DB dumps. Every member uses their own LOCAL PostgreSQL DB. No cloud database substitution.

Checkpoints 11:30, 13:30, 15:30 IST: pull main, migrate, seed, run typecheck/tests/build and demo smoke test. Feature freeze 16:15; bug fixes only until 16:45; record video at 16:45; code freeze 17:00, video submission 17:30. These are planning times, shifted together if kickoff/deadline changes. A has a 40-minute pre-freeze reserve; B must hand off by 12:15 before leaving at 12:30; C/D have 45/50-minute reserves. The full-day MUST budgets fit the planning window in TASKS.md. Test only against disposable/local data, especially later concurrency and performance tests.

Billing is disabled until B implements transactions and node-cron and A integrates the shared startup wiring. Do not remove the explicit scheduler startup refusal until real job wiring exists. Email delivery is implemented by feature owners later; development fallback logs may include reset links, so never use them in production. Tasks, dependencies, acceptance priorities and cut list are in TASKS.md.
