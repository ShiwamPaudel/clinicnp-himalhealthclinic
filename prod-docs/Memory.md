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
**Phase:** **All five phases complete.** The product is built, tested and documented. What remains is not development: deploying it to Vercel with the owner's environment variables, and walking `Go-live-checklist.md` at the clinic with their own data.
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
**Schema applied (v2):** `0006_modules_fy.sql` · `0007_stock_out.sql` · `0008_clinic_core.sql` · `0009_services.sql` · `0010_consultation_groups.sql` — all on the hosted Turso. Append-only; never edit an applied migration.

**Environment quick-reference:**
- pnpm 11.13 (installed via npm; corepack blocked by Program Files permissions) · vitest · Vercel
- pnpm settings in `pnpm-workspace.yaml` (`verifyDepsBeforeRun: false`, `onlyBuiltDependencies`)
- Local dev needs `TURSO_DATABASE_URL=file:./local.db` + `AUTH_SECRET`. v2 adds `BLOB_READ_WRITE_TOKEN`.
- Seeded logins: admin/admin123 (PIN 1234), bikash/staff123 (PIN 5678)
- Commands: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, `pnpm build`, `pnpm test`
- **Windows notes:** libsql `file:` paths need a Windows-style path with a drive letter (a Git Bash `$(pwd)` unix path gives SQLITE_CANTOPEN 14). `next start` can leave a process holding the port — free it with `Get-NetTCPConnection -LocalPort N -State Listen | Stop-Process`.
- **Testing note:** integration tests import repos with the vitest `@` alias plus a `server-only` stub (`tests/stubs/server-only.ts`); point `TURSO_DATABASE_URL` at a temp file DB before importing repos; `fileParallelism: false`; `__resetDbForTests()` between files.

**In progress:** —

**Next up:** the install itself. **Two things are needed from the owner and cannot be worked around:**
1. A Vercel Blob store created with **private** access. The supplied token is valid but its store is public, and a public store hands out permanent world-readable URLs — the app refuses to put patient files there (D-055). The access mode is fixed when a store is created, so this needs a new store, not a setting.
2. Real ClinicNP icon art for `public/icons/*.png`, which the owner said they would supply at the end.

Then: `pnpm db:migrate`, `pnpm db:bootstrap` (**not** `db:seed`), deploy, and walk `Go-live-checklist.md`.

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
| D-048 | Clinic tables use **TEXT ULID primary keys**, and the id IS the client ULID — no separate `ulid` column | Matches `bills`, so an offline registration keeps one identity end to end (Phase 5). Architecture's INTEGER-key sketch would have needed a second column saying the same thing |
| D-049 | Files go to **Vercel Blob `access:'private'`**; with no token configured they go to a gitignored `.filestore` instead | The private mode exists in @vercel/blob 2.8. The local folder is a development convenience so the upload/serve path is testable without provisioning a store — it is never used when a token is present, and it is not a second production backend |
| D-050 | The visit vocabulary lives in **`lib/visit-types.ts`**, not in the repo | `lib/repos/*` is `server-only`, and the browser needs the same labels. Importing a value from a server-only module broke the build; types and labels now sit outside the repo layer |
| D-051 | `lib/age.ts` shifts a notional birth date back with the **day clamped to the month end** | Without the clamp, 29 Feb minus one year became 1 March, which delayed every later birthday and cost a whole year at the leap-day boundary. Caught by a test, fixed in the module |
| D-052 | "Files pending" currently lists **visits with no file attached** | The PRD defines it as billed services flagged "keeps a file". Services arrive in Phase 3; until then a visit with nothing attached is the honest stand-in, and the repo query narrows in Phase 3 |
| D-053 | The follow-up window runs from the last **paid** consultation, not from the last follow-up | `lastConsultationAd` ignores lines where `followup_applied = 1`. Otherwise one paid visit would chain free follow-ups indefinitely, each one restarting the clock |
| D-054 | Which service groups count as **consultations** is a flag on the group (`0010`), not the group's name | The doctor-share bases `pct_consult`/`fixed_consult` pay on consultations only, and the follow-up window is a consultation idea. Every group is renameable and a clinic may add "Emergency Consultation", so matching on the name would be a rule that quietly breaks the first time somebody edits a label |
| D-055 | A **public** Vercel Blob store is refused outright; files fall back to local disk and the checklist says why | The supplied token was valid but its store was created with public access, which hands out permanent world-readable URLs — exactly what a patient's lab report must never have (Rules §1.13). A store is created public or private once and for all, so this needs a new store, not a setting |
| D-056 | The server **refuses** a line claiming a follow-up discount the rule does not allow, but **accepts** a person deliberately charging the full rate inside the window | The first is a price nobody chose — stale catalog or worse. The second is a call somebody made at the counter, marked on the line with the magenta dot and audit-logged. Architecture §5.3 says the server wins; it does not say the server overrules a human being |
| D-057 | `bill_service_lines.partner_cost_paisa` stores the cost **per test**, not per line | The ledger multiplies by quantity. Storing the line total as well would double-count the moment anyone billed two of anything — which is exactly what the first draft did |
| D-058 | The outbox payload is built by an **exported, tested function** rather than inline | It is listed field by field so the queue's bookkeeping never reaches the server, and that shape silently dropped service lines and the patient when bills grew. `tests/outbox.test.ts` fails when a bill gains a field the payload does not carry |
| D-059 | Clinic reports filter on **AD dates**, like every other report | The range picker and the fiscal-year selector both produce AD bounds. One date basis is what makes a clinic report and a pharmacy report over the same period agree with each other; BS is still what people read |
| D-060 | A bill in a **closed year is refundable**, into the year that is open, carrying a reference to the original invoice | The closed year's figures must never move (D-029), but a patient standing at the counter is owed their money. The closed year keeps the sale; the open year carries the refund |
| D-061 | The dashboard trend computes **each series on its own, net of refunds** | It used to sum `bills.total_paisa`, which is gross, so subtracting a net service figure drew a medicine line reading Rs 509 beneath a tile reading Rs 9. Both halves are now netted the same way and the chart adds up to the tiles |
| D-062 | A doctor's share on a refunded line is scaled by **how much of the line was refunded** | A fully refunded consultation takes its whole share back; a partial refund takes back its share of it. The frozen `doctor_share_paisa` stays on the row either way, so nothing is rewritten |
| D-063 | On a screen narrower than 768px the menu **starts as icons only** | A 232px menu on a 390px phone leaves 158px for the day's takings. A phone's choice is not written to the width preference, so a desktop does not inherit it |
| D-064 | A patient registered offline is identified by a **client-minted ULID**, and the bill made for them carries their details inline | The two queues drain independently and either can land first. Whichever reaches the server creates the person under that id; the other finds them already there. Without the inline copy, a bill that overtook its registration would have nobody to belong to |
| D-065 | Two devices registering the same person offline **both land**, and are listed for review rather than merged | Both records are real and both may already have a bill against them. A household sharing one phone is ordinary, and two people can have one name — so the machine says what matches and a person decides |
| D-066 | **One retry loop drives both queues**, registrations first, and the status chip counts them together | What the counter needs to know is how much work has not left this machine, not which list it is on. Registrations go first only so the common case is tidy; nothing depends on the order |
| D-067 | After three failures an item **stops retrying in silence**: the counter says why and an Admin may take it out | A queue that retries forever without saying so is how a day's work disappears. Nothing is ever discarded without somebody choosing to |
| D-068 | Logging out clears the caches and **deliberately leaves the queues** | A bill or registration that has not reached the server is work nobody else has a copy of. Signing out is not a reason to throw it away |
| D-069 | The backup carries a **manifest** of patient files, not the bytes | A clinic's scans run to hundreds of megabytes and a backup nobody can download is not a backup. After a restore the owner is told how many files were found and how many were not |
| D-070 | The service worker **never caches a write, and never caches a patient file** | A cached "OK" would swallow a day's work, and a file must not sit in a browser cache on a shared counter machine after somebody signs out |
| D-071 | `lib/bs.ts` unwraps the converter's **CommonJS default** either way | Next's bundler hands back the constructor; a plain Node runner hands back the module object. Any script using BS dates died on `NepaliDate is not a constructor` |
| D-072 | Guide chapters are numbered **by position**, not by a number typed into each title | Inserting the clinic chapters in the middle produced two chapter sixes |
| D-073 | The **INSERT arity check** lives in `scripts/audit.mjs`, not in a code review | `saveCompany` shipped with fourteen columns against fifteen values and threw on every single call. Counting placeholders is something a person does badly and a machine does perfectly |
| D-074 | Every repo function a screen calls gets **at least one test that calls it** | The company profile was the one write path no test touched, and it was the one that was broken. Green tests measured what was covered, not what worked |
| D-075 | **Service groups are the department list.** There will not be a second list of departments | Groups already carry the services, their rates and their reports. A parallel department table would drift from them within a month, and then two screens would disagree about which department a test belongs to |
| D-076 | The outside-lab workflow stops at **Report received**. ClinicNP records that a report came back; it never records what the report says | Himal sends samples out and the partner laboratory issues the result. Storing values would make ClinicNP look like the authority on a number it did not measure. This is the same line Rules §2.2 draws around lab results, and it holds |
| D-077 | **Opening stock is not a purchase**, and will not be recorded as one | Entering the shelf as a fake purchase invents a supplier, an invoice number and a payable that nobody owes. `createBatchWithStock` already takes a null `purchaseId`; the gap is a screen, not a schema |
| D-078 | **The rack map and the free-text shelf note both stay**, and the item form shows whichever fits: the picker when racks are drawn, the note when they are not | Deleting the note would throw away what shops typed for years; showing both at once would give one question two answers. The note also remains the counter's fallback, so a shop that never draws a rack loses nothing |
| D-079 | **An item's shelf is saved by the item form**, not by a separate action, and validated by one shared `assertCellFits` | A second save button for a field on the same screen is a second thing to forget. Both writers — the form and the shelf inspector — go through the same check, so a rule added once holds everywhere |
| D-080 | **Racks ride in the offline catalog**, and `catalogVersion()` counts them | The counter has to name a shelf with the connection down, like everything else it does. Renaming a rack touches no item and no stock move, so without racks in the version string a counter would keep lighting up "Rack 1" after it became "Fridge" |
| D-081 | A rack cell is **all three columns or none**. A rack chosen with no row and column is **refused**, never quietly stored as no shelf | Half a cell is somebody who meant to finish and was interrupted. Dropping it silently loses their intent; the map then lights nothing and nobody knows why |
| D-082 | Shelf information is shown **at search**, not on the bill line | Search is the one second between hearing a name and walking to a shelf. Once the medicine is on the bill it has already been fetched, and a location on a printed bill tells the customer where the shop keeps its stock |
| D-083 | **`items` is a product catalogue, not a shop's copy of one.** Where a medicine is kept moved to `item_locations` (0013), and `items.rack` / `rack_id` / `rack_row` / `rack_col` were dropped | Vicks comes in a jar in every pharmacy in Nepal; which shelf it sits on is true in one shop. Mixing the two means a shared Nepali catalogue could never be imported or refreshed without trampling what each shop arranged. D-078 to D-081 stand, but on the new table |
| D-084 | **Selling rates have the same problem and are NOT being moved.** `item_units.selling_rate_paisa` is per-shop and stays where it is; the rule is that an import creates missing items and never overwrites a rate, a location or stock | Splitting rates off `item_units` would touch billing, returns, valuation, profit and the offline catalog for no benefit the import cannot get by simply not writing that column. Worth revisiting only if ClinicNP ever becomes multi-tenant |
| D-085 | **A shop floor holds racks, shelves and desks.** One table, one `kind` column, no behaviour attached to it | All three are a grid of places as far as the software is concerned. The distinction is for the person reading the map: a plan that says "Rack 3" while they are looking at the front desk is a plan they stop trusting. The day a desk needs its own rules it is a different feature, not a different label |
| D-086 | **No CHECK constraint on `racks.kind`**, and an unrecognised value reads as a rack | This project has twice rebuilt a table to widen a CHECK (0007 for stock_moves.reason, 0012 for the whole company table). A CHECK here would guard a column only a compiler-checked enum writes to, and would cost a rebuild the day somebody adds a fridge |
| D-087 | **Drawing the room is a setting; putting things in it is stock.** Settings to Shop layout draws furniture, Stock to Shelves places medicines | The owner's own words: location "is something I would like to Stocks". It is also the faster path, since a shop opening with two hundred items will not visit two hundred item-edit screens, and this screen keeps focus in the search box after each placement |

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

### C-003  ·  2083-05-13  ·  Phase 2 — PHASE COMPLETE
Built: `0008_clinic_core.sql` (patients, visits, attachments + `bills.patient_id/visit_id/kind`). `lib/age.ts` (+18 tests) and `lib/patient-no.ts`. Repos for patients (transactional lifetime numbering, idempotent on the client id, search, duplicate detection, Admin merge), visits (per-year numbering, today's list, cancel-with-reason) and attachments (soft delete + 30-day sweep). `lib/files.ts` + `lib/file-store.ts`. `/api/files/upload`, `/api/files/[id]`, `/api/cron/files-gc`. Screens: patients list, register, patient card with the navy header and visit timeline, edit, merge, Today, visits list, visit detail with vitals, files pending. OPD slip. Clinic nav group.
Decisions/assumptions: D-048 … D-052.
Schema changes: `0008_clinic_core.sql`, applied to the hosted Turso after a scratch dry run.
Broke/fixed: fixed a leap-day bug in the age roll-forward before it shipped (D-051). Hit — and fixed — a build break from importing a runtime value out of a `server-only` repo into a client component (D-050).
Verified: **144 tests green over three consecutive runs**; build clean. Browser-verified against the live DB: registration in 856 ms, duplicate warning inline, visit started, PDF + photo uploaded, **file URL 401 logged out / 200 with `nosniff` signed in, zero storage keys in the page source**, and with the clinic module off all eight clinic routes plus the file route return 404 (200 again when switched back on). Verification data was then removed from the database.
Not built (requested, out of scope): none. Lab results, reference ranges and sample workflow remain out of scope (Rules §2.2) and nothing in this phase approaches them — ClinicNP stores the file it receives and does not read it.
Next: Phase 3 — services, doctors, lab partners, and clinic billing on the shared counter.

### C-004  ·  2083-05-21  ·  Phase 3 — PHASE COMPLETE
Built: `0009_services.sql` and `0010_consultation_groups.sql`. `lib/clinic-calc.ts` (follow-up rule, doctor share, +23 tests). `lib/bill-calc.ts` widened to take service lines and return one set of totals, with per-service VAT and a proportionally shared bill discount — the v1 tests are untouched and still pass, which is the proof the medicine path did not move. Repos for services, doctors and lab partners. Settings → Services / Doctors / Lab partners, all module-gated. Counter: unified search with F3 scoping, the navy patient bar on `P` with inline registration, service line rows with doctor and laboratory pickers, the follow-up notice and its magenta override. `/api/bills` ingest widened; `/api/followup`, `/api/patients`, `/api/patients/search` added. Invoice service block on thermal and A5, plus the lab dispatch slip. Clinic vocabulary in `lib/strings.ts` with Nepali variants. Sample clinic catalog in the seed, every rate flagged as a sample.
Decisions/assumptions: D-053 … D-058.
Schema changes: `0009_services.sql`, `0010_consultation_groups.sql`, both dry-run on a scratch file DB before the hosted Turso.
Broke/fixed: **the outbox dropped service lines and the patient in transit** — a mixed bill left the counter complete and arrived as a medicine-only sale, silently. Found only because the browser check read the saved row back instead of trusting the screen. Fixed and guarded by `tests/outbox.test.ts`. Also removed two NUL bytes a heredoc had left inside `patients.ts`, where a "match nothing" sentinel was meant; it is `NULL` now. Also caught and fixed a nonsense per-line VAT expression and a partner cost that would have double-counted against quantity.
Verified: **211 tests green.** Counter bundle 144 kB against the v1 ceiling of 140 kB — +2.9%, well inside the 15% allowance. Browser-verified against the live database: one search box returning both kinds with tags, F3 narrowing, a service bill refused without a patient, a mixed bill saving as `kind = mixed` with the visit opened and doctor shares of Rs 200 and Rs 240 from snapshotted terms, the follow-up notice in plain words with an override offered, the dispatch slip naming the laboratory, and — offline — an instant search, a provisional slip, nothing in the database, then exactly one bill and one stock movement on reconnect. With the clinic module off every clinic route 404s and a queued service bill is refused 409. Verification data was then removed.
Not built (requested, out of scope): none. Lab **results** remain out of scope (Rules §2.2) — ClinicNP records that a test was sent and what it cost, and stores the file that comes back without reading it.
Next: Phase 4 — clinic back office, ledgers, reports, dashboard.

### C-005  ·  2083-05-21  ·  Phase 4 — PHASE COMPLETE
Built: refunds widened to service lines (nothing returns to stock) and to closed-year bills (recorded in the open year, referencing the original invoice). `lib/repos/clinic-reports.ts`: service revenue, doctor payouts, laboratory ledger with running balance and per-partner statement, patient visit register, new-versus-returning, diagnostics utilisation, and the real "files pending" that retires the Phase 2 stand-in (D-052). Six report screens plus laboratory payment entry, all fiscal-year aware and all exporting to .xlsx. Bill register gained a kind filter and the patient number; bill detail shows both line blocks. Dashboard split four ways with patients seen, registrations, files pending, top services and a two-series trend. Day close gained the four-way split. Audit log gained the whole new vocabulary in plain words. Every clinic screen, report card and export is module-gated.
Decisions/assumptions: D-059 … D-063.
Schema changes: none — Phase 4 is all reads on what Phase 3 laid down, plus `sale_return_service_lines` which 0009 already created.
Broke/fixed: the dashboard trend was drawing a medicine series gross of refunds directly beneath a tile that was net of them — Rs 509 against Rs 9 (D-061). Found by looking at the rendered chart, not by a test. Also found at 390px that the menu still took 232px, leaving 158px of usable screen: a real failure of the owner-on-phone acceptance box, and one my first overflow check passed because the layout scrolls inside a container.
Verified: **227 tests green**, including 16 Phase 4 integration tests where every figure is checked against a hand calculation written into the test — a mixed bill refunded across both kinds, ten consultations at 40%, twelve tests and two payments, and the day-close split reconciling to net sales. Browser-verified against the live database: the register, both bill blocks, a service refund with zero stock movements, all six reports, a laboratory payment moving the balance, five real .xlsx files, and — with the clinic off — no clinic panels, no clinic report cards, and 404 on every clinic report and export. Verified at 390px on dashboard, day close, patient search, laboratory statements, doctor payouts and bill detail. Verification data was then removed.
Not built (requested, out of scope): none. Lab **results** remain out of scope (Rules §2.2).
Next: Phase 5 — resilience, offline registration, and the install.

### C-006  ·  2083-05-21  ·  Phase 5 — PHASE COMPLETE, PROJECT COMPLETE
Built: `offline/patient-outbox.ts` with provisional numbers and an inline patient snapshot on the bill, so the two queues can land in either order. The counter's recent-patients slice, searched locally when the connection is down and said so on screen. "Possible duplicate patients" for post-sync review. One retry loop over both queues, a status chip that counts them together, and a stuck-queue notice after three failures. Backups extended to every table with a file manifest and an after-restore file check; the restore wording now says what a restore actually does. Service worker: nothing that writes is cached, no patient file is cached, and a navigation with no connection lands on a precached offline notice. Recovery from a deploy landing mid-shift. `db/bootstrap.ts` for an empty production start. `scripts/audit.mjs` (module guards, contrast, empty states) and `scripts/a11y.mjs`. `Go-live-checklist.md` and `Deploy.md`. User Guide regenerated with 48 screenshots and three clinic chapters.
Decisions/assumptions: D-064 … D-072.
Schema changes: none. Phase 5 is resilience and packaging on top of what 0006–0010 laid down.
Broke/fixed: the offline fallback did not work — serwist precaches the script that renders a page, not the page, so there was nothing to fall back to and no network to fetch it with; the offline notice is an explicit precache entry now. `db:bootstrap` hashed passwords with sha256 while the app verifies salted scrypt, which would have produced an Admin who could not sign in on the clinic's first morning. `lib/bs.ts` could not be used from any script at all (D-071). The counter's register-a-patient form had no ids, so its labels were not attached to its inputs. Guide chapters collided at six. My first concurrency test fired two write transactions at one SQLite file, which tests the driver's lock rather than the product and left the file locked for the four tests after it.
Verified: **247 tests green**, typecheck clean, sweep clean, audit clean, accessibility clean across seven screens with the rules proven against a page of deliberate faults. Counter bundle 146 kB against the v1 baseline of 140 kB — +4.3%, inside the 15% allowance. Patient search over 2,000 records: worst case 6.8 ms against a 100 ms budget. Verified in a production build on a tablet-sized profile: the service worker installs, the counter opens with no connection, a patient is registered under a provisional number, a mixed bill is billed and printed, nothing reaches the database, and on reconnect there is exactly one patient and one bill, correctly attached.
Not built (requested, out of scope): **CBMS** — the owner dropped it; the dead `cbms_queue` table remains only because 0004 is applied and migrations are append-only, and it is written down in `NOT_BACKED_UP` so nobody wonders. Lab results, reference ranges, sample workflow, EMR, appointments and SMS remain out of scope (Rules §2.2) and nothing was built near them.
Could not be done here: installing as a PWA on a physical Android tablet, and the Vercel deployment itself, both of which need the owner's hardware and account. The behaviour underneath each was verified in a real browser against a production build.
Next: the install. See "Next up" at the top.

### C-007  ·  2083-05-22  ·  Deployment unblocked, and the bug that green tests missed
Vercel refused the deployment. Not a build error — the build completed, then was rejected at `Deploying outputs...` with "Vulnerable version of Next.js detected". `next` 15.1.6 → **15.5.25** (stayed on 15.x; 16 is a major and this was not the week), and `next-auth` beta.25 → **beta.32**, which brings `@auth/core` to 0.41.3 and patches "configuration errors can cause auth checks to fail open". There is no stable Auth.js v5; `latest` is still 4.24.15.

**The company profile could never be saved.** `saveCompany` built an INSERT with fourteen columns, fifteen values and thirteen arguments. It threw `SQLITE_ERROR: 15 values for 14 columns` in the driver every time, the action caught it, and the owner saw "Something went wrong. Please try again." while trying to put the clinic's own name into the software. 247 tests were green because **no test ever called it** (D-074). Fixed, covered by `tests/company.integration.test.ts` (proven to fail without the fix), and the whole class is now mechanical (D-073): 66 INSERTs checked for column/value arity, with a comma splitter that respects quoted strings so `'Kalimati, Kathmandu'` counts as one value.

The `sw.js` "no-response" line reported alongside it was an **aborted RSC link prefetch** — cosmetic, and not why the save failed. Verified after the fix in a browser on a production build with the service worker active: saves, says Saved, survives a reload, zero console errors.

Also corrected: `Deploy.md` told the next person to run `pnpm audit`, which pnpm's own built-in shadows — that line never ran `scripts/audit.mjs` once.

Verified: **250 tests green**, typecheck clean, sweep clean, audit clean, counter bundle 146 kB → **143 kB** on the newer shared chunks. Middleware bypass CVE-2025-29927 confirmed never exploitable here — every page sits under a layout calling `requireUser()` and all 14 API routes guard themselves — checked by sending the bypass header and getting the same redirect to /login as an anonymous request.

### Requested at Himal, not yet built  ·  2083-05-22
The owner walked through how the clinic actually runs. What was asked for, and what is already there:

**Already built, no work needed.** Tests and their rates go in **Settings → Services**, each one carrying its group, rate, whether it is sent to an outside lab (with the partner and what they charge), whether a report is expected back, and whether a doctor is required. **Service groups are fully editable** — create, rename, delete — through `settings/catalog-actions.ts`. Ten are seeded.

**Real work, not yet started.**
1. **Department on a visit is free text.** `visits.department` is a plain string typed by hand; it must become a choice from the service groups (D-075). Until then two spellings of "Ultrasound" are two departments in every report.
2. **The outside-lab workflow has one step, not three.** `bill_service_lines.dispatched_at` and the dispatch slip exist. **Sample collected** and **Report received** do not, and neither does report-received closing that test's part of the visit (D-076).
3. **Opening stock cannot be recorded.** Batches are created only by a purchase. `createBatchWithStock` in `batches.ts:57` takes exactly the right shape — batch number, expiry, cost, quantity, and a **nullable `purchaseId`** — and has **no callers at all**. The count-correction adjustment cannot stand in: `StockOutLineInput` requires an existing `batchId`, so it can only top up a batch that is already there. Today the shelf has to be entered as a fake purchase, which invents a supplier and a payable (D-077).
4. **Lab bill on A4, top half only**, so one sheet carries two bills. `company.print_format` is `thermal | a5` today, and A5 is exactly half of A4 — this may be a stock-and-margins question rather than a new format.
5. **Reports out of the Pharmacy module.** Only four are gated on pharmacy — valuation, expiry, moving, profit. The rest already are not, so this is mostly where they sit in the navigation.
6. **Items and rates** — the owner said items "don't have a rate thing in them, just the units". Rates live on `item_units.selling_rate_paisa`, one per unit. Whether that is the complaint or the requirement is **not yet clear and was not guessed at**.

Still out of scope and not drifted into: lab **results**, reference ranges, EMR, appointments, SMS (Rules §2.2). Recording that a report came back is not recording what it said (D-076).

### C-008  ·  2083-05-23  ·  Racks made real: the map now points at something
The rack map shipped in C-007 could be drawn and could store nothing. There was no way to put a medicine on a shelf, the counter never read `company.rack_display`, and `setItemCellAction` had no callers — a floor plan with an empty floor. The owner asked the right question: what is the use of racks at billing, and how are they linked to the medicines? They were not linked at all.

Researched how other systems do it before building. Marg ERP and Gofrugal both keep stock rack-wise for exactly this purpose — "identify which item is kept in which rack **at the time of billing**" — and both also offer rack-wise stock and expiry reports, which turned out to be the more durable use. Western retail (Lightspeed) stores Aisle/Bay/Shelf/Bin as a text code. **Nobody draws a picture**, because their users are trained staff for whom `A-3-2` is faster to read than a map. Himal's counter staff are not, which is why the picture stays — but the text form had to work too, and now does.

Built: **`cell-picker.tsx`**, the one "where is it kept" control, adapting to whether racks exist (D-078). **`shelf-inspector.tsx`** on Settings → Racks — click a shelf, see what is on it, put things on it, take them off; this is the bulk path, because a shop opening with two hundred items will not visit two hundred edit screens. **The counter** now honours all three `rack_display` modes: off, the shelf written out beside every result, or the map with the cell lit beside the results list. **`/reports/shelf`** — the shop in the order you walk it, with the unshelved last where they read as work remaining, plus an .xlsx export that doubles as a stock-take sheet. **The expiry report** gained a Shelf column and a "Shelf by shelf" ordering, so clearing near-expiry stock is one walk instead of six. `db:seed` now draws two sample racks with the demo medicines on them, because a training database that shows an empty floor plan teaches that the feature does not work.

Decisions/assumptions: D-078 … D-082.
Schema changes: **none.** `0011` and `0012` already created `racks` and the three `items` columns; this session filled them in. **Production needs a deploy, not a migration.**
Broke/fixed: two accessibility defects on the rack page, both from C-007 and both invisible until `scripts/a11y.mjs` was pointed at that screen — the edit and remove buttons were icon-only and announced as "button", and the rack map used 10px and 9px type. The a11y script now covers `/settings/racks` and `/reports/shelf` permanently. Also learned the hard way that `items.rack_id` carries a real enforced foreign key: racks cannot be deleted until the items on them let go, which is why `deleteRack` nulls the cells inside its batch and why `db/reset.ts` lists `items` before `racks`.
Verified: **263 tests green** (13 new in `tests/racks.integration.test.ts`), typecheck clean, sweep clean, audit clean at 76 routes and 69 INSERTs, accessibility clean across 9 screens. The catalog-version tests were mutation-checked — reverting racks out of the version string fails exactly those two and nothing else. Browser-verified against a throwaway seeded file database, 35 checks: the inspector opening on a clicked shelf, an item moved between shelves and the move read back out of the database, all three display modes at the counter (map lit, text only, silent), both reports, the .xlsx download, and — with every rack deleted — the free-text note taking over on both the item form and the counter, with the shelf list saying so instead of drawing an empty table.
Not built (requested, out of scope): the put-away direction (a delivery arriving and the software saying where each item goes) was identified in the research as a real third use and deliberately left out — Himal has not asked for it.
Still open from C-007: department as a pick-list (D-075), sample-collected / report-received (D-076), the opening-stock screen (D-077), A4 top-half printing, reports out of the pharmacy module, and the item-master import. **`print_format = 'a4_half'` is still selectable in Settings and still prints thermal** — the setting landed in C-007 and the template did not.
Next: the owner's call. The A4 template is the smallest real gap; the item import is the largest win before go-live.

### C-009  ·  2083-05-23  ·  The item master stops knowing where things are
The owner read C-008 and pushed back on the part that mattered: "linking the rack thing on the item isn't something I expected — the item is supposed to go public." They are right, and the reason is sharper than "it feels wrong". `items` describes a **product**: Vicks VapoRub comes in a jar, and that is true in every pharmacy in Nepal. Which shelf it sits on is true in exactly one shop. With location on `items`, a shared Nepali catalogue could never be imported — or refreshed later — without trampling what each shop had arranged. C-008 built the right feature on the wrong table.

`0013_furniture_and_locations.sql` moves it. `item_locations` is keyed by item, owned by the installation, and carries the free-text note as well; `items.rack`, `rack_id`, `rack_row` and `rack_col` are **dropped**, so the item master now holds nothing about where anything is (D-083). One location per item today, but a table rather than columns precisely so that "Vicks by the counter and on the back rack" needs one index dropped rather than a schema redesign. No table rebuild was needed — libSQL accepts ALTER … DROP COLUMN, verified against copies of real data before the migration file was written.

Also asked for and built: **racks, shelves and desks** (D-085). One `kind` column, no behaviour attached, no CHECK (D-086). The map draws a desk squared off and a shelf as a thin plank so the plan reads without a legend, and picking a kind reshapes the defaults (a shelf is 1x6, a desk 2x4) only while the name and size still look untouched. And **Stock → Shelves**, the tab the owner asked for: click a shelf, type a name, it is placed, and the search box keeps focus for the next one. Underneath is the list of everything with no place — the honest measure of how far the job has got — with an inline note field for things genuinely kept loose. Settings → Racks became **Settings → Shop layout** and now only draws the room (D-087).

Decisions/assumptions: D-083 … D-087.
Schema changes: **`0013_furniture_and_locations.sql`** — the first migration since 0012, and the first here to drop columns. Dry-run twice against copies of real data (one with cells populated, one with only notes): both carried everything into `item_locations`, both left zero dangling foreign keys.
Broke/fixed: the counter's `PosRack` had no `kind`, so a desk would have drawn as a rack — caught by the catalog-snapshot test, not by looking. `catalogVersion()` had to gain `item_locations`: since 0013 moving a medicine writes only to that table and no longer touches `items.updated_at`, so without it a counter would have kept pointing at the old shelf for as long as its cache lasted. `db/reset.ts` and `backup.ts` both needed the new table in the right order — it points at **both** racks and items.
Verified: **271 tests green** (21 in the rack suite, rewritten around the new model, including one that reads `pragma_table_info('items')` and fails the day somebody puts a location column back). Typecheck, sweep and audit clean at 71 INSERTs; accessibility clean across 10 screens. Counter bundle 145 to **144 kB**. Browser-verified on a fresh 0013 database, **38 checks**: a shelf added through the kind picker and read back out of the database, an item moved between shelves, taken off, and given a written note instead, the item form proven to no longer mention location at all, an item edited without disturbing where it is kept, and the counter still lighting the right cell with the desk drawn beside it.
Not built: the two questions the owner asked — see below. Nothing was half-built toward either.
Next: the item-master import, which this migration was the precondition for.

### Answered at Himal, 2083-05-23 — and still true
**"Can I update stock other than by a purchase?" — No.** `createBatchWithStock` in `batches.ts` takes exactly the right shape, including a nullable `purchaseId`, and has **no callers outside tests** — correcting an earlier note in C-007 that said no callers at all. It also hardcodes `reason = 'purchase'`, so an opening-stock screen needs either a new `'opening'` reason (stock_moves.reason carries a CHECK, so that means a table rebuild) or an accepted lie in the ledger. Recommend the rebuild: opening stock and a purchase are different facts and the day-book should not claim otherwise. Until then the shelf can only be entered as a fake purchase, which invents a supplier and a payable (D-077).

**"Any Excel file at installation, or do we create items one by one?" — One by one, today.** There is **no import path anywhere in the codebase**: `exceljs` appears in exactly one file, `api/export/[report]/route.ts`, and only to write. Items, suppliers and purchases are all hand-entered. For an install with a few hundred medicines that is not acceptable, and it is the largest remaining win before go-live. 0013 was the precondition — an importer can now create missing items and touch neither location, rate nor stock.
