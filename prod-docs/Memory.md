# Memory.md — ClinicNP
### The AI agent's working memory. Read it first, every session. Update it at the end of every session.

> **Why this file exists:** when the context resets or a different tool picks up the project, this file is the difference between continuing the work and rediscovering (or hallucinating) the codebase. Maintaining 40 lines here is cheaper than burning tokens re-reading everything.

> **Migration note for whoever installs this file:** this replaces the header and decisions table of the previous Faarma Memory.md. **Keep the previous file's full session entries S-001 … S-009 verbatim** under "Inherited session log" below — they are history and Rules.md forbids deleting them. The one-line index below is an index, not a replacement.

---

## How to maintain this file (rules for the AI)

1. **Read this file first, every session** — before opening any code.
2. **Update it at the end of every working session**, not only at phase ends. This is part of the Definition of Done (Rules.md §7).
3. **Append, don't rewrite.** Session entries are immutable. Only the "Current state" block is edited in place.
4. Keep it tight: Current state ≤ 45 lines; each session entry ≤ 15 lines. Link to files and commits instead of pasting code.
5. Record every **decision** and **assumption** the moment it's made, especially deviations from the PRD or Architecture.
6. Record anything that was **requested but deliberately not built** (out-of-scope asks per Rules.md §2) so the next session doesn't quietly build it.
7. Never store secrets, patient data, or real customer data here.

---

## CURRENT STATE  *(edit in place — the only mutable section)*

**Product:** **ClinicNP** — clinic + pharmacy, two toggleable modules. First install: **Himal Health Clinic Pvt. Ltd.** (both modules on).
**Predecessor:** Faarma v1 (pharmacy only), itself formerly AushadhiPOS. AushadhiPOS is fully retired as a name. Faarma survives only as the derived `appName` when the Clinic module is off.
**Phase:** **Phase 1 complete** (all four milestones + CBMS removal). Ready for Phase 2 (patients, visits, files) once the outstanding items below are settled.
**Repo:** `D:\IBN\Installations\clinicnp-himalhealthclinic` — git initialised 2083-05-12. Imported from `D:\IBN\Products Codebase\AushadhiPOS` (the v1 tree, which had no git history). The old tree is untouched and is the fallback.
**Inherited v1 state:** all 5 v1 phases complete; `pnpm build` clean; **68 tests green** (one known flaky test-isolation failure in the phase-4 file — different test each run, always green on re-run, caused by the shared `db()` singleton across test files). Not yet deployed to Vercel.
**Deployed URL:** — (none yet). **New hosted Turso** (`healthclinic-…`) provisioned 2083-05-13, migrated to `0007` and seeded. The old `fa…` database is abandoned — do not point at it again.
**Live data note:** the new Turso holds seeded sample data only (2 sample medicines, 3 batches, 1 sample supplier, admin + bikash). One real stock-out (SO-2083/84-000001) was recorded against it while verifying Phase 1. No patient or clinical data exists yet. **Once the clinic enters real data, go back to capturing against a throwaway local file DB.**

**Schema state (inherited):** `0001_init.sql`, `0002_auth_security.sql` (`login_throttle`), `0003_bill_line_short.sql`, `0004_compliance.sql` (`company.cbms_enabled`), `0005_item_shape.sql`. Extra columns vs the original spec: `items.preferred_supplier_id`, `company.min_rate_is_cost`, `items.shape`. **All five are applied on the hosted Turso** (verified 2083-05-12, `0005` at 2026-07-16T02:35Z) — the old "may still need 0005" note was stale.
**Audit facts established 2083-05-12 (do not re-derive):**
- `stock_moves.reason` **has** a CHECK → `0007` must rebuild the table. `users.role` **has** a CHECK `('admin','staff')` → Accountant needs a rebuild too.
- Table rebuilds work **only** with `PRAGMA foreign_keys = OFF` issued *outside* the transaction. `PRAGMA defer_foreign_keys = ON` inside the transaction **fails** with `SQLITE_CONSTRAINT_FOREIGNKEY` (tested both ways).
- Architecture's `0006` as written **fails on real data**: two `fiscal_years` rows both default to `'open'` and the partial unique index dies. Default must be `'closed'` + one explicit `UPDATE`.
- Hosted DB has **two** fiscal years both `active = 1`; `getActiveFiscalYear()` (`ORDER BY id DESC`) therefore returns **2082/83**, the older year, which holds 4 of the 5 bills. `ensureFiscalYear` never deactivates the prior year. Must be reconciled when `status` lands.
- All business tables use **TEXT ULID** primary keys; only `fiscal_years` is INTEGER. Architecture's `closed_by INTEGER` / `patient_id INTEGER` are type errors.
- v1 `/billing` bundle measured **140 kB** First Load (Rules §5 says "~130 kB"); after milestone 1 it is **135 kB**.
**Schema plan (v2):** `0006_modules_fy.sql` · `0007_stock_out.sql` · `0008_clinic_core.sql` · `0009_services.sql` · `0010_*` as needed. Append-only; never edit an applied migration.

**Environment quick-reference:**
- pnpm 11.13 (installed via npm; corepack blocked by Program Files permissions) · vitest · Vercel
- pnpm settings in `pnpm-workspace.yaml` (`verifyDepsBeforeRun: false`, `onlyBuiltDependencies`)
- Local dev needs `TURSO_DATABASE_URL=file:./local.db` + `AUTH_SECRET`. v2 adds `BLOB_READ_WRITE_TOKEN`.
- Seeded logins: admin/admin123 (PIN 1234), bikash/staff123 (PIN 5678)
- Commands: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, `pnpm build`, `pnpm test`
- **Windows notes:** libsql `file:` paths need a Windows-style path with a drive letter (a Git Bash `$(pwd)` unix path gives SQLITE_CANTOPEN 14). `next start` can leave a process holding the port — free it with `Get-NetTCPConnection -LocalPort N -State Listen | Stop-Process`.
- **Testing note:** integration tests import repos with the vitest `@` alias plus a `server-only` stub (`tests/stubs/server-only.ts`); point `TURSO_DATABASE_URL` at a temp file DB before importing repos; `fileParallelism: false`; `__resetDbForTests()` between files.

**In progress:** —

**Next up:** Phase 2 — patients, visits, files (`0008_clinic_core.sql`, `lib/patient-no.ts`, `lib/age.ts`, the patient card, OPD slip). **Blocked on:** real ClinicNP icon art (see Known issues), and the owner's ruling on D-040.

**Known issues / risks (inherited):**
- `nepali-date-converter.toJsDate()` returns non-midnight times → `lib/bs.ts toAD()` normalises to local midnight; keep all date maths on `toAD()` output (D-006).
- Stock valuation "salable value" uses the base-unit selling rate — a conservative proxy (D-010).
- Offline bills print a provisional slip number; the final SI number appears on reprint after sync (D-003).
- CSP still allows inline script (nonce CSP deferred); the login throttle is per-identity, not per-IP (API rate limiting is now per-user/IP in our own DB — D-045).
- `public/icons/*.png` (favicon, 192, 512, maskable) are still **Faarma artwork**. Raster files cannot be redrawn here and Rules §10 forbids inventing brand assets. **The owner must supply real ClinicNP icons before go-live.**
- The dashboard still shows pharmacy panels when the pharmacy module is off; Phases.md schedules "layout adapts when only one module is on" for Phase 4.
- Reports are year-aware via `?fy=` (the range clamps to the chosen year). Per-report recomputation beyond the range — and the "refund a closed-year bill into the open year" path — remain Phase 4.

**Requested but deliberately NOT built** *(keep this list; it is the scope fence)*
- Lab result entry / report generation / reference ranges — belongs to Nidanyo, not ClinicNP (Rules.md §2.2).
- EMR features, prescription printing, appointments, SMS, patient portal.

---

## DECISIONS LOG  *(append only)*

### Inherited from Faarma v1 — still binding
| # | Decision | Why |
|---|---|---|
| D-001 | No ORM; raw SQL via `@libsql/client` in `lib/repos/` | Team practice; transaction control |
| D-002 | Stock in base units only; conversion in `lib/units.ts` | One source of truth for strip/tablet maths |
| D-003 | Offline bills get provisional numbers; final invoice number assigned on sync | Server-side sequential numbering is a compliance requirement |
| D-004 | Magenta reserved for human decisions + one CTA per screen | Design discipline |
| D-005 | Auth.js v5 split config: edge-safe `auth.config.ts` for middleware; providers/DB only in `auth.ts` | Keeps libsql/node-crypto out of the edge runtime |
| D-006 | `toAD()` normalises to local midnight; all date maths uses it | Converter returns non-midnight times |
| D-007 | PIN quick-switch is a second Credentials provider (`id: "pin"`) | Reuses one session mechanism |
| D-008 | *(assumption)* `items.preferred_supplier_id` + `company.min_rate_is_cost` added up front | Needed by reorder + below-cost warning |
| D-009 | Login/PIN lockout: 5 fails / 15 min → 15-min lock | A 4-digit PIN must be throttled |
| D-010 | *(assumption)* Salable value = sellable base qty × base-unit rate | Consistent, conservative |
| D-011 | Purchase per-base cost spreads over free/bonus units | Bonus stock genuinely lowers unit cost |
| D-012 | Backup/restore is a logical JSON export/import in one txn with `PRAGMA defer_foreign_keys=ON`, not Turso branch-swap | Branch-swap needs the platform API; logical restore is atomic |
| D-013 | PWA via serwist; `src/app/sw.ts` excluded from the app tsconfig; SW off in dev | Avoids dom/webworker lib conflicts |
| D-014 | Brand name "Faarma" (per logo art) | Owner-confirmed at the time |
| D-015 | User guide = self-contained HTML with real screenshots, owner prints to PDF | Simplest reliable handover |
| D-016 | Visual picker sells in base unit at base rate; larger-unit pricing stays on the unit chip | v1 scope |
| D-017 | Manufacturer dropped from the item UI; column retained | Owner request |
| D-018 | Perceived slowness was `pnpm dev` recompiles; production is fast | No code change needed |
| D-019 | **Hard block on overselling** (client + server + 409 route); supersedes the soft-allow era of `bill_lines.short_base_qty` | Owner decision |
| D-020 | Item `shape` drives all unit art; default `tablet` | Pictorial picker |
| D-021 | Inline unit panel replaces the modal picker | Owner mockup |
| D-022 | SVG art, not photos, for unit art | Offline-safe, small |

### New for ClinicNP v2
| # | Decision | Why |
|---|---|---|
| D-023 | **ClinicNP continues the Faarma repository** rather than starting green-field | v1's FEFO, outbox, numbering and print are proven and tested; rebuilding would risk all of it for no gain. *(If the owner instead wants a separate repo, this is the one decision to flip — everything else in these docs holds either way.)* |
| D-024 | **AushadhiPOS retired everywhere**; Faarma survives only as the derived `appName` when the Clinic module is off | One codebase, two sale-able SKUs, no extra setting |
| D-025 | `appName` is **derived from enabled modules**, not stored as a setting | Avoids settings sprawl (Rules.md §6) |
| D-026 | **Service lines live in `bill_service_lines`**, a sibling of `bill_lines` under the same `bills` parent — not a widening of `bill_lines` | Keeps the hottest, most-tested table and the whole FEFO path untouched; the two line kinds have genuinely different shapes |
| D-027 | **One sales invoice series** covers medicine, service and mixed bills | IRD expects one unbroken sequence per business; a mixed invoice cannot belong to two series |
| D-028 | **Patient numbers are lifetime** (`P-000123`) from a `counters` table, never reset at year close, never reused after a merge | A patient is not a fiscal-year object |
| D-029 | **Closed fiscal years are read-only**; corrections are booked in the open year with a reference to the old number | A closed year's report must never change after it is closed |
| D-030 | **Modules enforced server-side** via `requireModule()`, with a 404 (not 403) for disabled routes | Hiding nav is cosmetics; a 403 would confirm the data exists |
| D-031 | **Age stored as value + unit + "as on" date**, with DOB optional | Nepali clinics record age, not DOB; a stored age must never display as if it were current |
| D-032 | **Partner cost and doctor share are snapshotted onto the bill line** at billing time | Editing a rate or a share must never rewrite history |
| D-033 | **Patient files: server-mediated upload and serve only**, private blobs, soft delete with a 30-day GC | A file URL that works logged-out would be a serious breach |
| D-034 | **Offline patient registration** reuses the bill outbox pattern (client ULID → provisional number → server-assigned number on sync); duplicates are flagged for a human, never auto-merged | A clinic in a power cut still has to register the person in front of them |
| D-035 | Stock-out reasons are a **fixed list**, not user-configurable codes | Reports depend on stable reason semantics; free-form codes make them meaningless |
| D-036 | ClinicNP lives in a **new git repo** at `Installations/clinicnp-himalhealthclinic`, seeded from the v1 tree; the v1 tree is left untouched | v1 had no git at all, so there was no rollback net. Confirms D-023 (continuation) while giving Phase 1 a safe baseline commit |
| D-037 | The wordmark is **typographic, not raster** (`components/ui/wordmark.tsx`) — sage with the "NP" in navy; Faarma renders in sage alone | A derived name (D-025) cannot be a fixed image. Also removed `next/image` from the counter, taking `/billing` from 140 kB → 135 kB. The old Faarma brand PNGs are deleted |
| D-038 | The counter's IndexedDB is renamed `faarma` → `clinicnp` with a **verified carry-over**: copy `outbox` + `held`, confirm the counts, and only then delete the old database | A queued bill is never destroyed to tidy a name. Risk is near-zero anyway (v1 never deployed), but the guard is cheap |
| D-039 | The hosted Turso is **never** the dev target. `.env.local` in this repo points at a local file DB and carries **no** Turso credentials | Memory's standing rule: never test or capture against the clinic's data |
| D-040 | *(assumption, pending owner)* The vocabulary sweep **excludes `db/migrations/`** | `0001_init.sql:1` carries the retired name in a comment and Rules §5 forbids editing an applied migration. The name survives in no shipped string |
| D-041 | **CBMS removed entirely** at the owner's instruction, not left behind a toggle | The clinic does not report to the government billing system. `cbms_queue` and `company.cbms_enabled` stay in the schema (unused, empty) because removing them needs a rebuild that buys nothing |
| D-042 | Table rebuilds use `PRAGMA foreign_keys = OFF` **outside** the transaction | Tested: `defer_foreign_keys = ON` inside the transaction fails with `SQLITE_CONSTRAINT_FOREIGNKEY` on `DROP TABLE`. `db/migrate.ts` implements this behind the `@rebuild` directive, with `@verify` row counts |
| D-043 | **`(app)/loading.tsx` removed.** Its Suspense boundary streamed a 200 before any guard ran, so `notFound()` gave a 404 body with a 200 status | Rules §1.11 needs a real 404. Measured 200 → 404 after removal. `NavProgress` still covers navigation feedback. Reasoning kept in `src/app/(app)/README-loading.md` |
| D-044 | Middleware does **not** enforce modules (contra Architecture §2.2) | Middleware is edge-only and D-005 keeps libSQL out of the edge runtime. Enforcement is `requireModule`/`requireModulePage` at every page, route and action — verified 200 → 404 → 200 across all 15 pharmacy routes |
| D-045 | **Rate limiting lives in our own database** (`rate_limits`), no third-party service | Owner asked for it without external dependencies. Fixed windows keyed by window index, so one upsert is the whole algorithm; swept by the nightly cron |
| D-046 | **`bill_line_batches` is read back by `rowid`, not `id`** | Ids are ULIDs, and two minted in the same millisecond sort backwards ~44% of the time (measured over 20,000 pairs). `ORDER BY id` was handing returned stock to the wrong batch and mis-costing COGS. This was the real cause of the "flaky phase-4 test" — it was never flakiness |
| D-047 | Accountant is enforced read-only by `canBill()`, not just by the role label | Every existing `role !== "admin"` branch meant "staff"; without an explicit guard the new third role would have silently inherited Staff's billing rights |

*(Add D-036+ as they happen. Assumptions use the `ASSUMPTION:` prefix.)*

---

## SESSION LOG  *(append only — newest at the bottom)*

### Template
```
### C-___  ·  [BS date]  ·  Phase [N]
Built: …(files/features, 2–4 bullets)
Decisions/assumptions: D-___ …(or "none")
Schema changes: …(migration file, or "none")
Broke/fixed: …
Verified: …(which acceptance boxes from Phases.md now pass)
Not built (requested, out of scope): …(or "none")
Next: …(the single most important next step)
```

### Inherited session log (Faarma v1) — index only; **paste the full original entries here and keep them**
- **S-001** · 2083-03-30 · Phase 1 — Next 15 + TS strict + Tailwind v4, tokens/fonts, `0001_init.sql` (21 tables + FEFO index), `lib/bs.ts` + `lib/money.ts` (+22 tests), Auth.js v5 (password + PIN), UI kit, layouts, settings/users, dashboard.
- **S-002** · 2083-03-30 · Phase 2 (+security) — lockout (`0002`), `lib/units.ts` (+13 tests), repos for items/suppliers/batches/purchases/catalog, all Phase-2 screens, `/api/catalog`; 7-part integration acceptance.
- **S-003** · 2083-03-30 · Phase 3 — the POS: `fefo.ts`, `invoice-number.ts`, `bill-calc.ts`, `ingestBill` (idempotent, authoritative FEFO), outbox/held/catalog cache, POS components, thermal + A5 print. `0003`.
- **S-004** · 2083-04-01 · Phase 4 — bill register + detail, sale returns, dashboard (recharts), reports hub + 8 reports, xlsx export, audit screen.
- **S-005** · 2083-04-01 · Phase 5 — CBMS queue + cron, backup/restore (`0004`), PWA via serwist, Nepali label toggle, cron auth, README.
- **S-006** · 2083-04-01 — Rebrand AushadhiPOS → Faarma, PWA icons, cursor/perf fixes, self-contained User Guide (Playwright capture + build scripts).
- **S-007** · 2083-04-01 — UX round 2: required purchase batch/mfg/expiry, collapsible sidebar, progressive disclosure, POS "Back to app", CSP, visual unit picker v1.
- **S-008** · 2083-04-01 — Hard block on overselling across client, server and route (409), outbox surfaces the reason. D-019.
- **S-009** · 2083-04-02 — Pictorial unit picker driven by item `shape` (`0005`), inline POS Unit panel, SVG unit art. D-020/021/022. 68 tests green.

### C-001  ·  2083-05-12  ·  Phase 1 (milestone 1 of 4 — rename)
Built: repo established + git baseline; **rename to ClinicNP** — package `clinicnp` v2.0.0, metadata/title template, `manifest.json`, README, guide scripts, backup filename (`clinicnp-backup-*`), xlsx creator, sidebar preference key; `lib/app-name.ts` (derived name + description, 6 tests); typographic `Wordmark`/`AppMark` replacing the raster Faarma art; IndexedDB `faarma` → `clinicnp` with a verified carry-over; Design.md tokens — Faarma orange **retired**, navy `--color-clinic-*` scale added.
Decisions/assumptions: D-036, D-037, D-038, D-039, D-040 (assumption).
Schema changes: none yet (`0006`/`0007` are milestones 2 and 4).
Broke/fixed: nothing broke. Counter bundle *improved* 140 kB → 135 kB by dropping `next/image` from the POS tree.
Verified: `pnpm build` clean; **74 tests green** (68 inherited + 6 new); browser confirms `<title>` = ClinicNP and the only IndexedDB is `clinicnp`; login, dashboard and counter all read ClinicNP. Vocabulary sweep clean outside `db/migrations/` (D-040).
Not built (requested, out of scope): none.
Next: milestone 2 — `0006_modules_fy.sql`, `lib/modules.ts`, Settings → Modules, and the `requireModule('pharmacy')` retrofit.

### C-002  ·  2083-05-13  ·  Phase 1 (milestones 2-4 + CBMS removal) — PHASE COMPLETE
Built: **CBMS removed** entirely (D-041). **Module system** — `0006_modules_fy.sql`, `lib/modules.ts`, Settings → Modules, retrofit onto 18 pages + 7 actions, nav grouping, derived name/title. **Fiscal years** — status + close-year wizard + selector + closed-year banner + `ClosedFiscalYearError` on every write path; Accountant role wired through. **Stock out** — `0007_stock_out.sql` (stock_moves rebuild), `lib/repos/adjustments.ts`, reason-tile entry screen, register with value-by-reason, detail + 80mm note, xlsx export, and the Expired list re-routed through the one path. **Rate limiting** in our own DB.
Decisions/assumptions: D-041 … D-047.
Schema changes: `0006_modules_fy.sql`, `0007_stock_out.sql` — both applied to the new hosted Turso after a dry run on a scratch copy.
Broke/fixed: **found and fixed a real pharmacy bug (D-046)** — sale returns restored stock to the wrong batch ~44% of the time because allocation order was recovered by ULID sort. This had been mis-recorded as "flaky test isolation" since v1. Also fixed: `createPurchase` briefly lost its fresh-install bootstrap; the seed created a fiscal year with no status.
Verified: 106 tests green, 8 consecutive clean runs (the suite is no longer flaky). Build clean. Browser-verified against the live DB: all 15 pharmacy routes 200 → 404 → 200 on the module toggle; a pharmacy-only install titles itself "Faarma"; a 1-strip supplier return took stock 30 → 20, credited the supplier, wrote the purchase return and a reason-carrying ledger row, and logged the audit entry.
Not built (requested, out of scope): none. Deferred to their scheduled phases: dashboard module-adaptive layout (Phase 4), refunds of closed-year bills into the open year (Phase 4).
Next: Phase 2 — patients, visits and files.
