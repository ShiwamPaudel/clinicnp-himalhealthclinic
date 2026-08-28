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
**Phase:** *(set at the start of Phase 1)* — v2 not yet started. Inherited codebase is v1 feature-complete.
**Inherited v1 state:** all 5 v1 phases complete; `pnpm build` clean; **68 tests green** (one known flaky test-isolation failure in the phase-4 file — different test each run, always green on re-run, caused by the shared `db()` singleton across test files). Not yet deployed to Vercel.
**Deployed URL:** — (none yet). Running on the owner's hosted Turso.
**Live data note:** the owner's hosted Turso holds only leftover test rows ("Test Brand", inactive "cc"); seeded demo items are gone. Re-seed with `pnpm db:seed` if needed. **Capture screenshots against a throwaway local file DB, never against their Turso.**

**Schema state (inherited):** `0001_init.sql`, `0002_auth_security.sql` (`login_throttle`), `0003_bill_line_short.sql`, `0004_compliance.sql` (`company.cbms_enabled`), `0005_item_shape.sql`. Extra columns vs the original spec: `items.preferred_supplier_id`, `company.min_rate_is_cost`, `items.shape`. **The owner's hosted Turso may still need `0005` applied** (`pnpm db:migrate`) — check before anything else.
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

**Next up:** Phase 1 — rename to ClinicNP, module system, fiscal-year status + close-year wizard, stock out with reasons.

**Known issues / risks (inherited):**
- `nepali-date-converter.toJsDate()` returns non-midnight times → `lib/bs.ts toAD()` normalises to local midnight; keep all date maths on `toAD()` output (D-006).
- Stock valuation "salable value" uses the base-unit selling rate — a conservative proxy (D-010).
- Offline bills print a provisional slip number; the final SI number appears on reprint after sync (D-003).
- CSP still allows inline script (nonce CSP deferred); the login throttle is per-identity, not per-IP.

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

### C-000 · *(the first v2 session writes its entry here)*
