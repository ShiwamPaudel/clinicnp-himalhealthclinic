# Go-live checklist — ClinicNP

For the person doing the install, working through it with the clinic. Nothing
here is optional; each line is something that has gone wrong somewhere before.

Work top to bottom. Anything you cannot tick, write down and settle before the
clinic bills a real patient.

---

## 0. Before the day

- [ ] **Turso database created**, and its URL and token in hand.
- [ ] **Blob store created with _private_ access.** This cannot be changed
      afterwards — a public store hands out permanent, world-readable links, and
      the app will refuse to use one for patient files. If the app says files
      are being kept "on this computer", the store is public and needs
      recreating.
- [ ] **`AUTH_SECRET`** generated (`openssl rand -base64 32`).
- [ ] **`CRON_SECRET`** generated the same way.
- [ ] Environment variables set in Vercel, all four:
      `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `CRON_SECRET`,
      plus `BLOB_READ_WRITE_TOKEN`.
- [ ] `pnpm db:migrate` run against the production database, and it reported
      every migration applied with no errors.
- [ ] `pnpm db:bootstrap` run with the clinic's real details. **Not `db:seed`** —
      that one fills the database with clearly-fake sample data for training,
      and a sample price that survives into a real bill is worse than an empty
      catalog.

---

## 1. The clinic's own details

- [ ] **Company name** exactly as it should print on an invoice.
- [ ] **Letterhead image uploaded** under Settings → Company. It is the band
      across the top of every invoice, and at Himal it already carries the PAN
      and DDA numbers, so read them off the image and check them against the
      registration certificate. A wrong number there is wrong on every bill.
- [ ] **PAN** entered and checked against their registration certificate. The
      invoice does not print it — the letterhead does — but the stock-out note
      and the refund note are plain slips with no letterhead, and they use this.
- [ ] **DDA number** entered if they hold one.
- [ ] **Address and phone** as they should appear on a slip a patient carries.
- [ ] **VAT decision confirmed with their accountant**, not assumed. If they are
      registered, switch it on and check that an invoice shows the VAT block. If
      they are not, leave it off — a VAT line on the invoice of a business that
      is not registered is a real problem for them.
- [ ] **Invoice footer** set to whatever they want at the bottom of a bill.
- [ ] **Print format** chosen — 80 mm thermal or A5 — and matching the printer
      actually in the room.
- [ ] **Rounding** decided: on if they round the final amount to the rupee.

---

## 2. Modules

- [ ] **Settings → Modules**: switch on what this clinic actually does. Both, for
      Himal Health Clinic.
- [ ] With the intended modules on, walk the menu and confirm nothing is offered
      that this clinic does not do.

---

## 3. Services, doctors, laboratories

- [ ] **Service groups** reviewed — rename, reorder or add so they match how the
      clinic talks about its own departments.
- [ ] For each group, is it a **consultation group**? The follow-up rule and the
      doctor's per-consultation share only apply to those.
- [ ] **Every service entered**, with the clinic reading the list back:
      - [ ] name as they say it
      - [ ] rate — **verified by the person who sets prices**, not copied from a
            price list of unknown age
      - [ ] does it need a doctor named on the bill
      - [ ] is it sent to an outside laboratory, and what does that laboratory
            charge
      - [ ] does a report come back for it (this drives "Files pending")
      - [ ] follow-up window and follow-up rate, for consultations
      - [ ] VAT, if the clinic is registered
- [ ] **No service still shows the "sample price" mark.** That mark means the
      figure came from a seed script and nobody has confirmed it.
- [ ] **Doctors entered**: name and qualification exactly as they should print,
      NMC number, and — confirmed with the owner — the **share basis and value**.
      Bills already made keep whatever the terms were at the time, so it is
      worth getting right before the first one.
- [ ] **Laboratory partners entered** with PAN, contact and settlement terms.

---

## 4. Medicines and opening stock

- [ ] **Items entered** with their unit ladder (box / strip / tablet) and
      selling rates.
- [ ] **Opening stock entered** — through a stock-count correction, so every
      figure has a batch number, an expiry and a reason behind it. Not by
      editing numbers.
- [ ] Spot-check five items against the shelf. If the screen and the shelf
      disagree on day one they will never agree again.

---

## 5. Printing

- [ ] Print a **test invoice on the real printer**, on a normal A4 sheet. Check:
      the letterhead image is sharp and not stretched, the BS date, the patient
      block, the service block above the medicine block, batch and expiry on a
      medicine line, one set of totals, and that nothing runs off the margin.
      Nothing prints below the total except the one footer line — no signature
      box, and no second PAN line under the letterhead.
- [ ] Print an **OPD slip** and confirm there is room for the doctor to write.
- [ ] Print a **lab dispatch slip** and confirm it names the laboratory.
- [ ] Print a **refund note**.

---

## 6. People

- [ ] **One user per person.** Shared logins mean the audit log cannot tell you
      who did anything.
- [ ] Roles set: Admin for the owner, Staff for the counter, Accountant if their
      accountant needs to read the reports.
- [ ] **PINs set** for anyone who switches at the counter.
- [ ] The bootstrap admin password changed if the installer chose it.
- [ ] Whoever works the counter has actually **made a bill themselves** before
      you leave.

---

## 7. Backups

- [ ] Take a **manual backup** and download it.
- [ ] **Restore it into a throwaway database and check it comes back.** A backup
      nobody has ever restored is a hope, not a backup.
- [ ] Confirm the nightly backup cron is firing (Vercel → the project → Cron
      Jobs, after the first night).
- [ ] Explain to the owner, in their words, what a restore does: the whole
      system goes back to that moment, and anything since is gone.

---

## 8. The first real day

- [ ] Register a real patient and bill them, with the clinic watching.
- [ ] **Pull the internet out** and bill another one. Confirm it prints, confirm
      the counter says the work is waiting, and confirm it lands when the
      connection returns.
- [ ] Show the counter what "not sent" looks like and what to do about it.
- [ ] Show the owner: the dashboard, the day close, and where the reports are.
- [ ] Agree who closes the fiscal year, and when.

---

## Afterwards

- [ ] Write the install date, the module choices and anything unusual into
      `prod-docs/Memory.md`.
- [ ] Leave the owner the User Guide.
