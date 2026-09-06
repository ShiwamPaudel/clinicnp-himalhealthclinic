# Deploy.md — ClinicNP

What has to be true for a deployment to work, and what to check after it does.
The install itself is `Go-live-checklist.md`; this is the machinery underneath.

---

## Environment variables

All five are required. The app fails loudly on the first four and quietly
changes behaviour on the fifth, which is why it is listed with the rest.

| Variable | What it is | If it is missing |
|---|---|---|
| `TURSO_DATABASE_URL` | the database, `libsql://…` | nothing works |
| `TURSO_AUTH_TOKEN` | its token | nothing works |
| `AUTH_SECRET` | signs the session cookie | nobody can sign in |
| `CRON_SECRET` | what the nightly jobs present to prove they are the scheduler | the crons are refused |
| `BLOB_READ_WRITE_TOKEN` | private file storage | **patient files are written to the machine's own disk instead** — they survive nothing, and a second instance cannot see them |

Generate the two secrets with `openssl rand -base64 32`. Set every one of them
for Production *and* Preview, or a preview deployment will quietly write to
whichever database it can reach.

### The storage token needs a private store

A Vercel Blob store is created either public or private and the choice is
permanent. A public store hands out URLs that work forever for anybody who has
them, which is not acceptable for a patient's lab report, so the app **probes
the store once and refuses to use a public one** — files fall back to local
disk and the go-live checklist reports it.

If files are landing on disk with a token set, the store is public and a new
one has to be created.

---

## A new migration means migrating production

The app is deployed from the repository; the database is not. A deploy
carrying a new migration lands code that queries tables the production
database does not have yet, and the pages that use them return 500 while
everything else keeps working — which is exactly what it looks like when only
one screen is broken.

```bash
pnpm db:migrate     # with the production env vars, before or right after the deploy
```

Check what production actually has before assuming:

```sql
SELECT name FROM _migrations ORDER BY name;
```

A migration that rebuilds a table deserves a dry run against a copy of the
real row first. `0012` rebuilds `company`, and its first version silently
dropped `module_pharmacy` and `module_clinic` — which would have switched the
Clinic module off at the clinic.

## Starting fresh after testing on sample data

`db:seed` is for training and leaves "Green Cross Sample Pharmacy", sample
services, sample doctors and demo patients behind. None of that belongs in a
database a clinic is about to bill from.

```bash
pnpm db:reset --yes      # empties every row, keeps the schema, restarts patient numbering
pnpm db:bootstrap --name "…" --pan … --admin … --password "…" --pin … --clinic
```

`db:reset` prints what it is about to delete and refuses without `--yes`. It
also refuses if it finds a table holding data that it does not know about,
rather than leaving it behind quietly.

**`--clinic` is not optional for Himal.** The schema defaults to
pharmacy-only, and without that flag every clinic route returns 404 on the
first morning for no visible reason.

---

## Vercel refuses to deploy a vulnerable Next.js

This is not a build error and it does not look like one. The build completes,
prints its route table, traces the server files, and is then rejected at
`Deploying outputs...` with:

```
Vulnerable version of Next.js detected, please update immediately.
```

There is nothing wrong with the code when this happens. The pinned Next.js
version has a published advisory against it and the platform will not host it.
The fix is to upgrade Next.js and redeploy; nothing else will clear it.

`pnpm audit --prod` lists what is outstanding. Prefer the newest release on the
major already in use — a major upgrade is not something to attempt while a
deployment is blocked.

---

## Deploying

```bash
# 1. schema first, always — the code assumes it
pnpm db:migrate

# 2. an empty production start (NOT db:seed, which is sample data)
pnpm db:bootstrap --name "Himal Health Clinic Pvt. Ltd." --pan 601234567 \
  --address "…" --phone "…" --admin sarita --admin-name "Sarita" \
  --password "…" --pin 1234

# 3. deploy
vercel --prod
```

Migrations are append-only and each one runs inside a single transaction with
its own bookkeeping row, so a failed migration leaves the database exactly as
it was. Run `pnpm db:migrate` before every deploy that contains a new one; it
is safe to run when there is nothing to do.

---

## After the first deploy

- [ ] Sign in as the bootstrapped Admin. If this fails, the password hash and
      `AUTH_SECRET` are the two places to look.
- [ ] **Settings → Backup**: take one, download it, and confirm the file opens.
- [ ] Add a patient file and confirm the app does **not** say files are being
      kept on this computer.
- [ ] Check both crons appear under the project's Cron Jobs, and confirm the
      next morning that the nightly backup ran.

### The crons

| Path | When | What it does |
|---|---|---|
| `/api/cron/backup` | 18:00 UTC daily | takes the nightly backup |
| `/api/cron/files-gc` | 18:30 UTC daily | permanently removes files deleted more than 30 days ago |

Both refuse anything that does not present `CRON_SECRET`, so they are safe to
leave reachable. 18:00 UTC is a quarter to midnight in Nepal — after the clinic
has closed, before the date rolls over.

---

## Checks that run in the repository

Run all of these before deploying. Each one has caught something real.

```bash
pnpm typecheck   # no TypeScript errors
pnpm test        # the full suite
pnpm sweep       # the retired name, backend words on screen, stray control characters
pnpm run audit   # module guards, colour contrast, empty states
pnpm build       # it compiles, and the counter bundle is visible in the output
pnpm a11y http://localhost:3000   # against a running instance
```

`pnpm run audit`, not `pnpm audit` — pnpm has a built-in command by that
name and it wins, so `pnpm audit` silently reports dependency advisories
instead of running any of the checks above.

The counter bundle is worth watching: v1 shipped at 140 kB First Load, and
Phases.md allows 15% growth. The build output prints it as `/billing`.

---

## When a deploy lands on somebody mid-shift

The service worker holds the file list of the version it was built from, so a
page open across a deploy asks for files the new build renamed. The app detects
that and reloads once — once only, because a reload loop is worse than the
problem. Nothing in either queue is at risk: bills and registrations waiting to
be sent live in IndexedDB and survive a reload, which is why they are there.

---

## Rolling back

Redeploying an earlier build is safe **only if it does not need an earlier
schema**. Migrations are append-only and are never automatically reversed, so a
rollback across a migration means restoring a backup taken before it. Take one
before deploying anything that migrates.
