# ClinicNP

Clinic and pharmacy management for Nepali polyclinics and retail pharmacies.
Two modules — **Pharmacy** and **Clinic** — each switched on or off independently,
sharing one counter, one invoice series and one set of books.

Keyboard-first billing, batch/expiry tracking with FEFO, Bikram Sambat dates,
PAN/VAT-ready invoices, and offline-tolerant sales that never lose a bill.

The product name is derived from the enabled modules: with the Clinic module on it
is **ClinicNP**; a pharmacy-only install shows **ClinicNP**.

Built with Next.js 15 (App Router, TypeScript strict), Turso (libSQL), Tailwind v4,
Auth.js, and a PWA offline layer (serwist + IndexedDB).

## Quick start

```bash
# 1. Install (pnpm)
pnpm install

# 2. Configure environment
cp .env.example .env.local
#   For local dev the defaults work: TURSO_DATABASE_URL="file:./local.db"
#   Generate a real AUTH_SECRET:  openssl rand -base64 32

# 3. Create the schema and seed a demo pharmacy
pnpm db:migrate
pnpm db:seed

# 4. Run
pnpm dev            # http://localhost:3000
```

### Demo logins (from the seed)

| Role  | Username | Password  | PIN  |
|-------|----------|-----------|------|
| Owner | `admin`  | `admin123`| 1234 |
| Staff | `bikash` | `staff123`| 5678 |

> Change or remove these before any real deployment (Settings → Users).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm test` | Run the vitest suite (pure-logic + integration) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:migrate` | Apply `db/migrations/*.sql` (append-only) |
| `pnpm db:seed` | Seed fiscal year, company, users, demo catalog |

## Environment variables

See `.env.example`. Required to run: `TURSO_DATABASE_URL`, `AUTH_SECRET`.
Optional until needed: `TURSO_AUTH_TOKEN` (hosted Turso), `CBMS_*` (IRD
transmission), `CRON_SECRET` (backup/CBMS cron auth).

## Deploying to Vercel

1. Set all env vars from `.env.example` in Project → Settings → Environment Variables
   (use a hosted Turso URL + token, and a strong `AUTH_SECRET`).
2. `vercel.json` registers the cron jobs (`/api/cron/cbms` every minute,
   `/api/cron/backup` nightly). They require `CRON_SECRET`.

## Project layout

```
src/
  app/            # routes: (auth) login, (app) back-office, (pos) billing, api/*
  components/     # ui kit, app screens, pos/*, print/*, charts/*
  lib/            # bs, money, units, fefo, invoice-number, bill-calc, repos/*, validators
  offline/        # idb, catalog-cache, outbox, held (IndexedDB)
  stores/         # zustand active-bill store
db/               # migrations + seed
tests/            # vitest (pure modules + phase integration tests)
prod-docs/        # PRD, Architecture, Rules, Phases, Design, Memory
```

## Core rules (see `prod-docs/Rules.md`)

- Money is integer **paisa** everywhere; formatting only in `lib/money.ts`.
- Stock is stored only in **base units**; conversion in `lib/units.ts`.
- All BS↔AD conversion goes through `lib/bs.ts`.
- Expired stock is unsellable — the FEFO allocator excludes it with no bypass.
- Invoice numbers are assigned server-side, per fiscal year, and are immutable.
- All SQL lives in `src/lib/repos/`. No ORM.
- Plain, user-facing language only — never expose backend vocabulary on screen.
