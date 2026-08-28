# Architecture.md — ClinicNP

> **Starting point:** ClinicNP is **not a green-field build.** It continues the existing Faarma codebase (Next 15 + TS strict + Tailwind v4 + Turso + Auth.js, 5 phases complete, 68 tests green). The repository is renamed, the product strings change, and the clinic module is added alongside the proven pharmacy code. **The pharmacy path — FEFO, unit maths, outbox idempotency, invoice numbering — is not rewritten, not refactored "while we're here", and not re-architected.** See Rules.md §0.

---

## 1. Stack (unchanged — do not revisit)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Database | Turso (libSQL) |
| DB access | `@libsql/client`, hand-written SQL in `src/lib/repos/` — **no ORM** |
| Hosting | Vercel |
| Styling | Tailwind CSS v4 + CSS variable tokens (Design.md) |
| State | Zustand (active bill only) + TanStack Query |
| Offline | serwist service worker + IndexedDB (`idb`) |
| BS calendar | `nepali-date-converter` wrapped in `lib/bs.ts` (single import point) |
| Excel | `exceljs` (server) |
| Auth | Auth.js credentials + PIN provider |
| Validation | Zod, schemas shared client/server |
| Charts | Recharts (dashboard/reports only, never in the counter bundle) |
| IDs | `ulid` |

**New in v2:** `@vercel/blob` for patient file storage (already a dependency pattern for backups). Nothing else is added. Image handling is browser-native — **no image-processing library on the server.**

---

## 2. System overview

```
┌──────────────────────── Browser (PWA) ─────────────────────────────┐
│  COUNTER  /billing   (client)                                      │
│   ├─ one search box ──► LOCAL CACHE (IndexedDB)                    │
│   │                      • items + units + live batches            │
│   │                      • services + groups        (clinic on)    │
│   │                      • recent patients (2,000)  (clinic on)    │
│   ├─ active bill  → Zustand  ·  hold → IndexedDB                   │
│   ├─ new patient  → OUTBOX (patients) ──┐        (clinic on)       │
│   └─ save bill    → OUTBOX (bills) ─────┤                          │
│                                          │                         │
│  BACK OFFICE (patients, visits, stock, purchases, reports, files)  │
│   └─ TanStack Query / RSC ──► server actions & route handlers ─┐   │
└────────────────────────────────────────────────────────────────┼───┘
                                                                 ▼
                                   ┌──── Vercel (Next.js server) ─────┐
                                   │  session → role → MODULE guard   │
                                   │  → Zod → repos (all SQL)         │──► Turso
                                   │  file upload/serve routes        │──► Vercel Blob (private)
                                   │  cron: CBMS drain · backup       │──► IRD CBMS (when on)
                                   └──────────────────────────────────┘
```

### 2.1 The three paths

**Path A — Counter (offline-tolerant, latency-critical).** Unchanged in shape from v1, extended in content:
1. On login the client pulls a **catalog snapshot** — items + units + live batches, plus (clinic on) **services + groups** and a **recent-patients slice** (most recently visited 2,000, identity fields only: number, name, age, sex, phone, address, allergy note). Deltas on focus/interval by `catalog_version`.
2. Search, FEFO preview, service lookup, patient lookup and totals all run locally.
3. **Save** writes to the IndexedDB outbox with a client ULID, optimistically decrements local stock, prints immediately.
4. Background sync POSTs to `/api/bills` (idempotent by ULID). Backoff 5 s → 4 min cap. Header chip in plain language.
5. **Server is authoritative** for FEFO, invoice numbers and patient numbers.

**Path B — New patient offline (clinic on).** Registration must work in a power cut, so it uses the same proven pattern as bills:
- The client mints a patient ULID, assigns a **provisional patient number** (`New – <ULID6>`), stores the record in an outbox, and lets billing proceed against the ULID.
- On sync, `/api/patients` is idempotent on the ULID and assigns the real sequential `patient_no` transactionally. Bills referencing the ULID resolve to the same patient regardless of which syncs first (see 2.5).
- On reconnect, if the server finds a strong duplicate (same phone + same name), it still creates the record and flags it into an Admin **"Possible duplicate patients"** list rather than silently merging. Merging is always a human decision.

**Path C — Back office (online).** Patients, visits, files, purchases, catalog admin, reports: server-rendered pages and server actions. Connectivity required; acceptable because this is planned work, not counter work.

### 2.2 Module enforcement

```
lib/modules.ts
  getModules()                     -> { pharmacy: boolean, clinic: boolean }   (cached per request)
  requireModule('clinic')          -> throws ModuleDisabledError  (server only)
  <ModuleGate module="clinic">     -> renders nothing when off    (nav + UI only)
```

Rules:
- **Every** clinic route handler, server action and repo entry point calls `requireModule('clinic')` before anything else. Pharmacy ones call `requireModule('pharmacy')`.
- Middleware additionally 404s disabled module URL prefixes so a bookmarked link doesn't leak the existence of data.
- `ModuleDisabledError` maps to a 404 page, never a 403 with an explanation.
- The module flags live on `company` (single row) and are read through one cached accessor — never queried ad hoc in a component.
- Nav hiding alone is never the enforcement. Hiding is cosmetics; the guard is the boundary.

### 2.3 Stock integrity (unchanged) + reasoned stock-out

- Stock stored **only in base units per batch**; all display conversion via `lib/units.ts`.
- Every mutation writes an append-only `stock_moves` row. `batches.remaining_base_qty` is the materialised view of that ledger.
- Sales decrement inside one libSQL interactive transaction with `WHERE remaining_base_qty >= ?` guards; insufficient stock throws `InsufficientStockError` and the whole transaction rolls back (hard block, D-019).
- **Stock-out adjustments** reuse exactly this machinery: `stock_adjustments` (header) + `stock_adjustment_lines` (batch, base qty, reason) → guarded decrements → `stock_moves` with the reason code. `returned_to_supplier` additionally creates a `purchase_returns` row so the supplier ledger stays the single source of truth for what the pharmacy owes.
- `stock_moves.reason` widens to: `purchase | sale | sale_return | purchase_return | write_off | adjustment | returned_to_supplier | disposed | damaged | lost | clinic_use | sample | count_correction`. **If `0001_init.sql` put a CHECK constraint on that column, the migration must rebuild the table** (`CREATE TABLE stock_moves_new … INSERT SELECT … DROP … ALTER RENAME`, inside one transaction, indexes recreated). Verify before writing the migration; do not guess.

### 2.4 Numbering

| Series | Scope | Format | Assignment |
|---|---|---|---|
| Sales invoice | Per fiscal year, **shared by medicine and service bills** | `SI-2083/84-000123` | Server, transactional |
| Sales return / refund | Per fiscal year | `SR-2083/84-000012` | Server |
| Purchase | Per fiscal year | `PI-2083/84-000045` | Server |
| Stock-out | Per fiscal year | `SO-2083/84-000007` | Server |
| Visit | Per fiscal year | `V-2083/84-000456` | Server |
| **Patient** | **Lifetime — never resets** | `P-000123` | Server, transactional, from `counters` |

One sales series across both modules is deliberate: IRD expects one unbroken sequence per business, and a mixed invoice cannot belong to two series. Offline bills print a provisional slip number and receive the final number on sync (D-003); offline patients behave identically.

`fiscal_years` gains `status ('open'|'closed')`, `closed_at`, `closed_by`. Exactly one open year is enforced by a partial unique index. Assignment always draws from the **open** year; a request to write into a closed year throws `ClosedFiscalYearError` → *"This year is closed. Record it in the current year instead."*

### 2.5 Bill ingest with service lines and patients

`/api/bills` (POST, idempotent on bill ULID) accepts:

```jsonc
{
  "id": "<ULID>",
  "patient": { "ref": "id" | "ulid" | null, "value": "...", "freeText": "..." },
  "visitRef": "<visit id | ulid | null>",
  "itemLines":    [ { "itemId", "unitLevel", "qty", "ratePaisa", "rateOverridden", "discountPaisa", "batchOverride?" } ],
  "serviceLines": [ { "serviceId", "qty", "ratePaisa", "rateOverridden", "discountPaisa",
                      "doctorId?", "labPartnerId?", "followupApplied?" } ],
  "payment": { "method", "tenderedPaisa" },
  "discountPaisa": 0, "clientCreatedAt": "…"
}
```

Server transaction order (one interactive transaction, all-or-nothing):
1. Idempotency check on `bills.id` → if present, return `alreadyExisted` with the stored invoice number.
2. Resolve fiscal year (must be open) and resolve patient: `id` → verify; `ulid` → look up, and if the patient outbox hasn't landed yet, **create the patient from the embedded snapshot in the same transaction** (the bill carries a minimal patient payload precisely for this ordering race).
3. Resolve or create today's visit when service lines are present.
4. Item lines: authoritative FEFO allocation, guarded decrements, `bill_line_batches`, `stock_moves`.
5. Service lines: insert, snapshotting `partner_cost_paisa` and the doctor's share basis **at the time of billing** (later rate changes must not rewrite history).
6. Assign invoice number from the open fiscal year.
7. Enqueue CBMS row.

If any step fails, nothing is written and the outbox keeps the bill with a plain-language reason on it.

### 2.6 Files (patient attachments)

- Upload goes **client → `/api/files/upload` (server) → Vercel Blob**, never client → Blob directly. The route checks session, role, module, size (15 MB) and MIME allow-list (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`), then stores with `access: 'private'` under `patients/<patientId>/<ulid>.<ext>`.
- Serving goes through `/api/files/[id]` which re-checks session, role and module, then streams the blob. **No public blob URLs and no signed URLs pasted into HTML.** A file URL that works when logged out is a defect.
- Metadata lives in `attachments`; the blob holds bytes only. Backup exports metadata plus a manifest of blob keys; a "full backup" job copies blobs to a dated prefix (Phase 5).
- Deletion is a soft delete (`deleted_at`, `deleted_by`) plus a blob delete after 30 days by the nightly cron, so a mistaken delete is recoverable for a month.

### 2.7 CBMS, backup, restore

- CBMS queue unchanged; service-only bills are transmitted the same way as medicine bills. Payload builder gains the service block. Nothing about the IRD payload format is invented — the builder is fed from one mapping file and is inert until Admin enables it with real credentials.
- Backup gains the new tables and the blob manifest; restore replays them in FK-safe order with `PRAGMA defer_foreign_keys=ON` (D-012). **Restoring a backup taken before a fiscal-year close must not silently reopen a closed year** — restore is a whole-database point-in-time return, and the confirmation text says so.

---

## 3. Database schema

### 3.1 Carried forward unchanged
`users` · `company` · `fiscal_years` · `items` · `item_units` · `suppliers` · `batches` · `stock_moves` · `purchases` · `purchase_lines` · `purchase_returns` · `purchase_return_lines` · `supplier_payments` · `bills` · `bill_lines` · `bill_line_batches` · `sale_returns` · `sale_return_lines` · `cbms_queue` · `backups` · `audit_log` · `login_throttle`

### 3.2 Altered (append-only migrations)

```sql
-- 0006_modules_fy.sql
ALTER TABLE company ADD COLUMN module_pharmacy INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company ADD COLUMN module_clinic   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fiscal_years ADD COLUMN status     TEXT NOT NULL DEFAULT 'open'; -- 'open'|'closed'
ALTER TABLE fiscal_years ADD COLUMN closed_at  TEXT;
ALTER TABLE fiscal_years ADD COLUMN closed_by  INTEGER REFERENCES users(id);
ALTER TABLE fiscal_years ADD COLUMN next_visit_no    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fiscal_years ADD COLUMN next_stockout_no INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX one_open_fy ON fiscal_years(status) WHERE status = 'open';

-- 0008_clinic_bills.sql
ALTER TABLE bills ADD COLUMN patient_id INTEGER REFERENCES patients(id);
ALTER TABLE bills ADD COLUMN visit_id   INTEGER REFERENCES visits(id);
ALTER TABLE bills ADD COLUMN kind       TEXT NOT NULL DEFAULT 'pharmacy'; -- 'pharmacy'|'clinic'|'mixed' (derived, stored for reporting)
ALTER TABLE users ADD COLUMN role_accountant INTEGER NOT NULL DEFAULT 0;  -- or widen role CHECK; see note
```

> **Note on `users.role`:** if `role` carries a CHECK of `('admin','staff')`, adding `'accountant'` requires a table rebuild. Prefer the rebuild (clean three-value role) over a boolean side-column; decide by reading `0001_init.sql` first and record the choice in Memory.md.

### 3.3 New tables

```sql
-- 0006_modules_fy.sql (continued)
counters(name TEXT PRIMARY KEY, next_value INTEGER NOT NULL)   -- lifetime sequences: 'patient_no'

-- 0007_stock_out.sql
stock_adjustments(id, adjustment_no, direction 'out'|'in', date_ad, date_bs,
                  reason TEXT, supplier_id NULL, visit_id NULL, note, total_cost_paisa,
                  user_id, created_at)
stock_adjustment_lines(id, adjustment_id, item_id, batch_id, base_qty,
                       unit_level_entered, qty_entered, cost_paisa)

-- 0008_clinic_core.sql
patients(id, ulid UNIQUE, patient_no UNIQUE NULL,      -- NULL until assigned on sync
         name, sex 'f'|'m'|'o',
         age_value INTEGER NULL, age_unit 'y'|'m'|'d' NULL, age_as_of_ad TEXT NULL,
         dob_ad TEXT NULL, phone, address, guardian_name, blood_group, note,
         referred_by, active INTEGER DEFAULT 1,
         merged_into_id NULL REFERENCES patients(id),
         created_by, created_at, updated_at)

visits(id, ulid UNIQUE, visit_no NULL, fiscal_year_id, patient_id, date_ad, date_bs,
       type 'new'|'followup'|'report_review', doctor_id NULL, department TEXT NULL,
       complaint TEXT, findings TEXT, advice TEXT,
       bp TEXT, pulse INTEGER, temp_c REAL, weight_kg REAL, spo2 INTEGER,
       status 'waiting'|'seen'|'closed'|'cancelled', cancel_reason TEXT,
       user_id, created_at, updated_at)

service_groups(id, name, sort_order, active)
services(id, name, code NULL, group_id, rate_paisa, doctor_required INTEGER,
         default_doctor_id NULL, outsourced INTEGER, default_lab_partner_id NULL,
         partner_cost_paisa INTEGER DEFAULT 0, keeps_file INTEGER,
         followup_days INTEGER DEFAULT 0, followup_rate_paisa INTEGER DEFAULT 0,
         vat_applicable INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
         created_at, updated_at)

doctors(id, name, qualification, specialty, nmc_no, phone,
        share_basis 'none'|'pct_consult'|'fixed_consult'|'pct_services',
        share_value INTEGER DEFAULT 0,     -- basis points for pct, paisa for fixed
        active, created_at)

lab_partners(id, name, pan_no, phone, address, contact_person, terms, active, created_at)

bill_service_lines(id, bill_id, service_id, qty, rate_paisa, rate_overridden INTEGER,
                   discount_paisa, amount_paisa, vat_paisa,
                   doctor_id NULL, lab_partner_id NULL,
                   partner_cost_paisa INTEGER DEFAULT 0,          -- snapshot at billing time
                   doctor_share_basis TEXT NULL, doctor_share_value INTEGER DEFAULT 0, -- snapshot
                   followup_applied INTEGER DEFAULT 0, visit_id NULL,
                   dispatched_at TEXT NULL)                        -- lab slip printed

sale_return_service_lines(id, sale_return_id, bill_service_line_id, qty, amount_paisa)

lab_partner_payments(id, lab_partner_id, date_ad, date_bs, amount_paisa, method, note, user_id)

attachments(id, ulid UNIQUE, patient_id, visit_id NULL, bill_service_line_id NULL,
            kind 'report'|'image'|'scan'|'other', title, file_name, mime, size_bytes,
            blob_key, uploaded_by, created_at, deleted_at NULL, deleted_by NULL)
```

**Indexes to add:**
`patients(phone)` · `patients(name)` · `patients(patient_no)` · `visits(patient_id, date_ad DESC)` · `visits(date_bs)` · `visits(doctor_id, date_bs)` · `bill_service_lines(bill_id)` · `bill_service_lines(service_id)` · `bill_service_lines(lab_partner_id)` · `bills(patient_id)` · `attachments(patient_id, created_at DESC)` · `attachments(bill_service_line_id)` · `stock_adjustment_lines(item_id)` · `stock_moves(reason, at)`

### 3.4 Why service lines live in their own table

`bill_service_lines` is a sibling of `bill_lines` under the same `bills` parent, rather than a polymorphic widening of `bill_lines`.

- The pharmacy line is a stock allocation (batch, unit level, FEFO, expiry). The service line is a priced act (doctor, partner, file). Sharing one row shape would mean five nullable columns and a rebuild of the single hottest, most-tested table in the product.
- The counter's proven path — FEFO, guarded decrement, idempotent ingest, 68 passing tests — keeps working untouched.
- Totals already live on `bills`; `lib/bill-calc.ts` widens to take both arrays and returns one set of totals. Reports union the two tables where a combined view is needed.

`bills.kind` is derived at ingest (`pharmacy` / `clinic` / `mixed`) and stored, purely so reports and dashboards can group without a double join.

---

## 4. Folder structure (additions marked ★)

```
clinicnp/
├── public/                          # ★ brand/ (ClinicNP marks), icons/, manifest
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (pos)/billing/           # the counter — now medicines + services + patient
│   │   ├── (app)/
│   │   │   ├── dashboard/
│   │   │   ├── patients/            # ★ list, new, [id] (card + timeline), [id]/edit, merge
│   │   │   ├── visits/              # ★ today, list, new, [id]
│   │   │   ├── files/pending/       # ★
│   │   │   ├── items/ · purchases/ · suppliers/
│   │   │   ├── stock/               # current, low, near-expiry, expired
│   │   │   │   └── out/             # ★ new stock-out + register
│   │   │   ├── bills/               # register (kind + FY filters), [id], returns, credit
│   │   │   ├── reports/             # + ★ service-revenue, doctor-wise, lab-partner,
│   │   │   │                        #   visit-register, patients-new-returning,
│   │   │   │                        #   diagnostics-utilisation, stock-out
│   │   │   └── settings/
│   │   │       ├── company/ · users/ · printing/ · compliance/ · backup/ · audit/
│   │   │       ├── modules/         # ★
│   │   │       ├── fiscal-years/    # ★ list, close-year wizard
│   │   │       ├── services/        # ★ groups + services
│   │   │       ├── doctors/         # ★
│   │   │       └── lab-partners/    # ★
│   │   └── api/
│   │       ├── bills/route.ts       # + service lines, patient resolution
│   │       ├── patients/route.ts    # ★ idempotent registration sync + search
│   │       ├── catalog/route.ts     # + services, service groups
│   │       ├── files/upload/route.ts        # ★
│   │       ├── files/[id]/route.ts          # ★ authenticated stream
│   │       ├── cron/{cbms,backup,files-gc}/ # ★ files-gc
│   │       └── export/[report]/route.ts
│   ├── components/
│   │   ├── pos/                     # + ★ PatientBar, PatientPicker, ServiceResultRow,
│   │   │                            #   LineKindTag, ServiceLineRow
│   │   ├── clinic/                  # ★ PatientCard, PatientSearch, VisitTimeline,
│   │   │                            #   VitalsRow, ServicePicker, AttachmentGrid, Uploader
│   │   ├── ui/  · charts/
│   │   └── print/                   # + ★ OpdSlip, LabDispatchSlip, StockOutNote,
│   │                                #   InvoiceThermal/A5 extended with a service block
│   ├── lib/
│   │   ├── db.ts · bs.ts · units.ts · fefo.ts · money.ts · invoice-number.ts · bill-calc.ts
│   │   ├── modules.ts               # ★ getModules / requireModule / ModuleGate
│   │   ├── patient-no.ts            # ★ lifetime counter allocation
│   │   ├── clinic-calc.ts           # ★ service line totals, follow-up rule, doctor share
│   │   ├── files.ts                 # ★ MIME/size validation, blob key builder
│   │   ├── age.ts                   # ★ age entry ⇄ display, "as on" handling
│   │   ├── strings.ts               # + derived appName (ClinicNP / Faarma)
│   │   ├── repos/                   # + ★ patients, visits, services, doctors,
│   │   │                            #   lab-partners, attachments, adjustments;
│   │   │                            #   extended: bills, reports, fiscal
│   │   └── validators/
│   ├── offline/
│   │   ├── catalog-cache.ts         # + services, patients slice
│   │   ├── outbox.ts                # bills
│   │   ├── patient-outbox.ts        # ★
│   │   └── sw.ts
│   └── stores/bill-store.ts         # + service lines, patient ref
├── db/migrations/0006 … 0010
└── tests/                           # + clinic-calc, age, patient-no, modules, phases
```

---

## 5. Key algorithms

### 5.1 FEFO (`lib/fefo.ts`) — unchanged, still pure, still shared client/server.

### 5.2 Units (`lib/units.ts`) — unchanged.

### 5.3 Follow-up rule (`lib/clinic-calc.ts`)
```
resolveFollowup(service, patient, doctor, todayBs, lastConsultOfSameDoctor):
  if service.followup_days == 0            -> normal rate
  if no previous consultation              -> normal rate
  daysSince = days(todayAd, lastConsultAd)      // via lib/bs.ts toAD(), never raw Date math
  if daysSince <= service.followup_days    -> rate = service.followup_rate_paisa (0 = free)
                                              flag followupApplied = true
                                              reason string for the bill line
  else                                     -> normal rate
```
Pure, unit-tested, identical on client (preview) and server (authoritative). The server recomputes and wins; a client/server disagreement never changes the printed total silently — the bill is rejected back to the outbox with the reason if the totals differ by more than zero.

### 5.4 Doctor share (`lib/clinic-calc.ts`)
```
shareFor(line):
  basis snapshotted on the line at billing time
  none          -> 0
  pct_consult   -> consultation lines only:  amount * basisPoints / 10000
  fixed_consult -> consultation lines only:  fixed paisa * qty
  pct_services  -> any service line:         amount * basisPoints / 10000
```
Integer paisa throughout; rounding is floor-to-paisa with the remainder retained by the clinic, stated once in the payout report footer.

### 5.5 Age (`lib/age.ts`)
- Entry: number + unit (`y|m|d`) stamped with `age_as_of_ad`, **or** a date of birth.
- Display: DOB present → computed live. DOB absent → age rolled forward from `age_as_of_ad` (a 3-month-old registered last year displays as ~1 year 3 months), always with the "as on" date available on hover. Never display a stored age as if it were current.

### 5.6 Patient number (`lib/patient-no.ts`)
`UPDATE counters SET next_value = next_value + 1 WHERE name='patient_no' RETURNING next_value` inside the same transaction that inserts the patient. Lifetime, never reset by year close, never reused after a merge (the merged-away number is retired, not recycled).

---

## 6. Security & multi-device

- Every server entry point: **session → role → module → Zod → repo.** No SQL outside `lib/repos/`.
- `/api/bills` and `/api/patients` idempotent on ULID; two devices cannot double-create.
- Patient files: authenticated stream only; blob keys never exposed to the client.
- Audit log covers: rate and service-rate overrides, follow-up overrides, bill cancels, refunds, patient edits/merges/deactivations, file deletions, stock-out entries, module toggles, fiscal-year closes, restores.
- Turso token, Blob token and CBMS credentials are server-side env vars only; the client never touches Turso or Blob directly.
- CSP retained from v1; the file-serving route sets `Content-Disposition` and `X-Content-Type-Options: nosniff`, and renders PDFs in a sandboxed viewer rather than inline HTML.
