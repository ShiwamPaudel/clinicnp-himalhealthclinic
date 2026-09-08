# Design.md — ClinicNP
### Visual language: "The Green Counter and the Blue Case Sheet"

The pharmacy half of this product already has a language and it works: the green cross sign, cream paper, and a chemist's magenta ink stamp for human decisions. **None of that is being redesigned.** The clinic half is not a second brand — it is the second piece of paper on the same counter.

So: **sage** is the counter. **Cream** is the paper. **Magenta** is the ink stamp — rare, deliberate, reserved for the moment a person made a call. And **navy** is new: the blue ballpoint of a case sheet. It marks *who this is about* — the patient, their visit, their file. Sage answers "what is being sold". Navy answers "who is it for". They never fight because they never do the same job.

If magenta appears more than twice on a screen, something is over-inked. If navy appears anywhere that isn't about a patient, it's wrong.

---

## 1. Color tokens (CSS variables)

### Sage (primary / brand / pharmacy) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--sage-950` | `#16241B` | Print text on cream, highest-contrast text |
| `--sage-900` | `#20342A` | Headings, sidebar background |
| `--sage-700` | `#35553F` | Primary buttons, active nav, focused borders |
| `--sage-600` | `#41684D` | Primary hover, links |
| `--sage-500` | `#557F60` | Chart primary series, icons |
| `--sage-300` | `#9DBCA4` | Disabled primary, subtle icons |
| `--sage-150` | `#D5E4D7` | Selected row background, chips |
| `--sage-75`  | `#EBF2EC` | Section tint, table header fill |

### Cream (surfaces) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--cream-100` | `#FAF6EB` | App background |
| `--cream-50`  | `#FFFCF4` | Cards, table rows, inputs |
| `--cream-200` | `#F1EADA` | Hovered rows, wells |
| `--line`      | `#E3DBC6` | Borders, dividers, table rules |

### Magenta (the ink stamp — accent only) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--magenta-600` | `#B02A6E` | Rate-override dot, shortcut keycap highlight, the one primary CTA on the counter, active unit-chip ring |
| `--magenta-700` | `#93235C` | Hover / pressed |
| `--magenta-100` | `#F7E2ED` | Chip and tint backgrounds |

**Magenta discipline (extended to the clinic):** it now also marks a **service rate edited at the counter** and an **overridden follow-up charge** — both are the same thing as an edited medicine rate: a person made a call. It is never used for patients, never for status, never for errors.

### Navy (the case sheet — new, clinic only)
| Token | Hex | Use |
|---|---|---|
| `--clinic-900` | `#16283F` | Patient card header, OPD-slip header rule |
| `--clinic-700` | `#234A78` | Clinic nav group active state, patient number, "Service" line tag |
| `--clinic-500` | `#3E6FA3` | Visit timeline spine, secondary clinic icons, chart series for services |
| `--clinic-150` | `#DCE7F3` | Selected patient row, service chip fill |
| `--clinic-75`  | `#EEF3FA` | Service block tint in a mixed bill, patient search results panel |

**Navy discipline:** navy appears only where a human being is the subject — the patient bar at the counter, the patient card, the visit timeline, the "Service" tag on a bill line, the clinic nav group, and the clinic series in charts. It is **not** a second primary: buttons stay sage, focus rings stay sage, and there is no navy fill larger than a card header. Navy is deliberately distinct from `--info-600` (#2E6E8C): darker, warmer-blue, non-cyan. If the two ever sit adjacent, use the info chip's icon to separate them.

### Status (functional) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--ok-600` / `--ok-100` | `#2F7D4F` / `#E2F1E7` | Saved, synced, in stock, paid |
| `--warn-600` / `--warn-100` | `#A8681B` / `#F9EDD9` | Near-expiry 31–60 d, low stock, below-cost rate, **file pending** |
| `--warn2-600` / `--warn2-100` | `#8F7A1F` / `#F7F1D6` | Near-expiry 61–90 d band |
| `--danger-600` / `--danger-100` | `#B3362B` / `#F9E4E1` | Expired, blocked sale, destructive confirm, **allergy strip** |
| `--info-600` / `--info-100` | `#2E6E8C` / `#E1EFF5` | Offline chip, neutral notices, **closed-fiscal-year banner** |

Errors are red, never magenta, never navy.

### Dark surfaces
Sidebar and the counter's payment pane stay `--sage-900` with `--cream-50` text. The **patient bar** at the counter is the one navy surface in the counter layout: a 44 px `--clinic-900` strip above the bill, cream text. No full dark mode.

### Retired
The Faarma orange brand tokens (`--color-brand-*`, #e87e28) are **removed**. ClinicNP's mark is sage and navy. A pharmacy-only install shows the Faarma wordmark in sage — the orange does not return.

---

## 2. Typography — unchanged, one addition

| Role | Face | Notes |
|---|---|---|
| Display / page titles | **Bricolage Grotesque** 600–700 | Page titles, dashboard numbers, invoice shop name |
| UI & body | **IBM Plex Sans** 400/500/600 | Workhorse |
| Devanagari | **Mukta** 400/500/600 | `unicode-range`-scoped to Devanagari glyphs |
| Numbers, money, tables, invoice body | **IBM Plex Mono** 400/500 or Plex Sans with `tabular-nums` | Every money and quantity column aligns vertically, always |
| **Patient identity** *(new)* | Plex Sans 600 at 18 px for the name; **Plex Mono 500** for the patient number | The number is data and must be scannable down a column; the name is a person and must not look like data |

Scale (rem): `12 / 13 / 14 (base) / 16 / 18 / 22 / 28 / 40`. Base UI 14 px; counter bill lines 16 px; minimum 12 px anywhere; line-height 1.45 body, 1.15 display.

---

## 3. Layout & spatial system

Unchanged: 4 px spacing base (`4, 8, 12, 16, 24, 32, 48`); radius 10 px cards, 8 px inputs, 999 px chips; one shadow level; 232 px fixed sidebar; 1240 px content max-width.

**Sidebar, with both modules on** — grouped, not merged, so nobody hunts:

```
  [ClinicNP mark]
  Dashboard
  Counter                      ← the billing screen

  CLINIC          (navy group label)
    Today
    Patients
    Visits
    Files pending

  PHARMACY        (sage group label)
    Stock
    Items
    Purchases
    Suppliers

  Bills
  Reports
  Settings
```
With one module on, the group labels disappear and the items sit flat — a pharmacy-only install looks exactly like Faarma v1. Collapsed (icon-only) mode from v1 is retained; group labels become a 1 px divider.

**The counter (`/billing`)** keeps its own layout — no sidebar, three zones — with one addition:

```
┌──────────────────────────────────────────────────────────────┐
│  search  (56 px, full width — medicines AND services)         │
├──────────────────────────────────────────────────────────────┤
│  ▌ PATIENT BAR  P-000123 · Anita Shrestha · 34 F · 98… ✕      │  ← navy, 44 px, only when clinic is on
├───────────────────────────────────────────┬──────────────────┤
│  bill table (the paper, cream)             │  payment pane    │
│   medicines block                          │  (sage-900,      │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                  │   320 px)        │
│   services block (clinic-75 tint)          │                  │
│   ─ ─ perforation ─ ─                      │                  │
│   totals                                   │                  │
└───────────────────────────────────────────┴──────────────────┘
```
Empty patient bar = a quiet navy-outlined strip reading `Add patient (P)`. At ≤ 900 px the payment pane docks to the bottom and the patient bar stays pinned under the search box — the front desk needs to see who they're billing more than they need to see the change due.

---

## 4. The two signature elements

### 4.1 The ink & paper bill — unchanged, extended
The bill table is still the paper slip it will become: cream card, hairline rules, Plex Mono amounts, dashed perforation above the totals, magenta dot beside a hand-edited rate, magenta left-rule on an overridden batch, and the 250 ms magenta **`✓ Saved / बिल बन्यो`** stamp on save — still the only animation on the counter.

New: in a mixed bill, the service lines sit in a `--clinic-75` block below the medicines, separated by a single hairline, each carrying a small navy **Service** tag and, where relevant, the doctor's name in 12 px `--clinic-500` beneath the service name. Medicines carry a sage **Medicine** tag only when services are present — a pharmacy-only bill needs no tag at all.

### 4.2 The patient card — the clinic's signature
One screen the clinic staff will open a hundred times a day. It must feel like picking up a physical case-sheet folder.

```
┌────────────────────────────────────────────────────────────┐
│ ▌P-000123        Anita Shrestha            34 Y · Female   │  navy header, cream text
│ ▌9841XXXXXX · Bhaktapur, Suryabinayak-4    Since 2081-05-12│
├────────────────────────────────────────────────────────────┤
│ ⚠ Allergy: Penicillin                                      │  danger strip, only when filled
├────────────────────────────────────────────────────────────┤
│ [Start visit]  [New bill]  [Add file]                      │
│                                                            │
│ ●───── 2083-04-12  Visit V-…-000456 · Dr. Karki · Follow-up│  navy timeline spine
│ │        Consultation, USG Abdomen        रु 1,700         │
│ │        📎 USG report.pdf                                  │
│ ●───── 2083-02-02  Visit V-…-000188 · Dr. Karki · New      │
│ │        Consultation, CBC, RBS           रु 950            │
│ ○───── 2082-11-20  Bill SI-…-000901 (medicines only)       │
└────────────────────────────────────────────────────────────┘
```

Rules for the timeline: one vertical navy hairline spine; a filled node for a visit, a hollow node for a bill with no visit; BS date leading, AD on hover; money right-aligned tabular; attachments as small paperclip chips that open inline. The spine is the only decorative line in the product and it earns its place — it is what makes eighteen months of a person's history readable in one scroll. No cards-in-cards, no avatars, no colour-coded visit types beyond the type word itself.

---

## 5. Components (new and amended)

**Patient bar (counter).** 44 px navy strip: patient number in Plex Mono, name in 600, age/sex, phone. `✕` clears. Empty state is an outlined strip: `Add patient (P)`. When a service line exists and no patient is set, the strip turns `--danger-100` with `Patient needed before saving` — the only red thing on the counter that isn't an expiry.

**Patient picker.** Opens on `P`. One input, three result columns (number · name + age/sex · phone/address), `↑↓ Enter`, and a persistent last row: `+ Register new patient (Ctrl+Enter)` which opens the 6-field inline form without leaving the counter. Duplicate warning appears inline under the phone field, never as a blocking dialog.

**Service result row.** Navy **Service** tag, service name, group in 12 px sage-500, rate right-aligned tabular. If the service is sent to an outside lab, a small navy outline chip with the partner's name. If it keeps a file, a paperclip glyph. No stock, no expiry, no unit chip — the absence is itself the signal that this line behaves differently.

**Follow-up notice.** When the follow-up rule fires, the line shows a 12 px navy note beneath the service name: *"Follow-up within 7 days — no charge."* Overriding it back to the full rate stamps the line with the magenta dot, same as any rate override.

**Vitals row.** Five small inputs on one line (BP, Pulse, Temp, Weight, SpO₂), each 88 px wide, all optional, all blank by default, no units typed by the user (suffix is a static grey label). Nothing validates a physiological range — the front desk does not need the software arguing with them.

**Attachment tile.** 96 px square: PDF glyph or image thumbnail, title on two lines max, kind chip, uploaded date in 11 px. Hover reveals view/download; delete only for Admin, behind a typed confirm. Upload zone is a dashed `--line` rectangle: *"Drag a report here, or take a photo."*

**Fiscal-year selector.** Header-right, next to the offline chip, only for Admin/Accountant: a quiet sage-outlined select showing `2083/84 · current`. Choosing a closed year swaps the whole page into read-only and drops an `--info-100` banner beneath the header: *"You're looking at 2082/83. This year is closed — you can read and print, but not change anything."* The banner is not dismissible; leaving the year is the way out.

**Stock-out reason select.** Not a bare dropdown: a 2-column list of reason tiles with a one-line consequence under each — *"Returned to supplier — this also credits the supplier's account"*, *"Used in the clinic — this comes out of stock but is not a sale"*. The consequence text is what stops the wrong choice.

**Module toggles (Settings → Modules).** Two large rows, each with the module name, a one-line description of what appears when it's on, and a switch. Turning one off shows a plain confirm: *"Turning off the clinic hides patients, visits and services. Nothing is deleted — turn it back on any time."* The last enabled module's switch is disabled with the reason shown inline.

**Unchanged:** Buttons (sage primary 40 px / 44 px counter, one magenta CTA per screen max, keycap chips), Inputs (40 px, 2 px sage focus ring — never blue, and **never navy**), Badges, Tables (sage-75 header, 44 px rows, hairlines, tabular numerics), Toasts (bottom-centre, one at a time, 3 s / 6 s errors), Empty states (icon + one plain sentence + one action), Offline chip, BS date picker, the pictorial unit picker driven by item shape.

---

## 6. Print design

**Invoice (80 mm thermal)** — as v1, with a patient block and a service block:
```
        HIMAL HEALTH CLINIC PVT. LTD.
       Address · 01-XXXXXXX · PAN: XXXXXXXXX
────────────────────────────────────────────
  Invoice  SI-2083/84-000123
  Date     2083-04-12  10:42     (2026-07-27)
  Patient  P-000123  Anita Shrestha  34 Y / F
────────────────────────────────────────────
  SERVICES
  OPD Consultation — Dr. Karki    1   500.00
  USG Abdomen & Pelvis            1  1200.00
  CBC (sent to Sample Path Lab)   1   450.00
  MEDICINES
  Sample Amoxicillin 500          2 Strip
    B-4471 · exp 2084-08          @28.00  56.00
- - - - - - - - - - - - - - - - - - - - - -
  Subtotal                            2206.00
  Discount                               6.00
  Total                               2200.00
  Cash 2500.00        Change   300.00
────────────────────────────────────────────
            Get well soon.
```
Rules: pure black on white, Plex Mono 10–11 pt, clinic name in Bricolage 14 pt, PAN directly under the address, service block always above the medicine block, batch and expiry in 9 pt under each medicine line, no colour, no logo raster.

**A5 invoice** — same content, wider, includes the dashed perforation rule, sage-950 text if colour printing is available, black otherwise.

**OPD slip (80 mm / A5)** — the patient's piece of paper. Navy header rule (black in thermal), patient number/name/age/sex, visit number, BS date, doctor, department, complaint, then **at least 60% of the page left empty** below a single hairline for the doctor's handwriting. Resist every urge to fill that space.

**Lab dispatch slip** — partner laboratory name largest after the clinic name, patient identity, tests listed with checkboxes, referring doctor, sample-collected-by line, BS date. Prints only for outsourced services. Two copies on A5 (one for the lab, one for the file) or one on thermal.

**Stock-out note** — items, batches, quantity in mixed units, reason in words, note, and a signature line.

---

## 7. Motion & feel

Default is stillness. Allowed: the save-stamp on the counter (250 ms), dialog fade + 4 px rise (150 ms), toast slide (150 ms), dashboard skeleton shimmer, and one new one — the **patient bar fills with a 120 ms left-to-right wipe** when a patient is attached, because that moment must be unmistakable at a glance in a queue. All gated by `prefers-reduced-motion`. Nothing animates while typing. The visit timeline does not animate on scroll.

---

## 8. Accessibility & quality floor

- Contrast ≥ 4.5:1 for all text pairs. Verified pairs: sage-700 on cream-50 = 6.9:1 ✓; magenta-600 on cream-50 = 6.2:1 ✓; **cream-50 on clinic-900 = 14.2:1 ✓; clinic-700 on cream-50 = 7.4:1 ✓; clinic-700 on clinic-75 = 6.9:1 ✓.** Re-verify every new badge tint pair before shipping it.
- Full keyboard operability with a visible 2 px sage focus ring at 2 px offset — including the patient picker, the vitals row and the attachment grid.
- Touch targets ≥ 44 px; the counter works on a 10" Android tablet; the file uploader works from a phone camera.
- Colour is never the only signal: the Service tag carries the word "Service"; the allergy strip carries a warning glyph and the word "Allergy"; the closed-year banner says "closed" in words.
- Language: sentence case, verbs on buttons ("Register patient", "Start visit", "Add file", "Record stock out", "Close year"), an action keeps its name through to its toast ("Register patient" → "Patient registered"), and no technical vocabulary anywhere (Rules.md §1).

---

## 9. The sign-in screen — the only branded screen

Everything behind the login belongs to the clinic: their name on the bill, their letterhead, their stock, their patients. A maker's badge in the corner of a counter screen is the maker talking over the shopkeeper all day, so there isn't one. The sign-in screen is the deliberate exception — nobody is working yet, and it is the screen a new member of staff stares at while somebody explains what this thing is.

**Layout.** Two halves, `lg:grid-cols-[1.05fr_1fr]`, each filling the viewport height.

```
┌───────────────────────────────┬────────────────────────┐
│ ClinicNP  (white artwork)     │                        │
│                               │  ┌──────────────────┐  │
│ The whole counter,            │  │ their letterhead │  │
│ on one screen.                │  └──────────────────┘  │
│ <derived tagline>             │                        │
│                               │  Log in                │
│ ▢ One bill for everything     │  Use the username and  │
│ ▢ Stock that watches itself   │  password you were     │
│ ▢ Patients and their visits   │  given.                │
│ ▢ Samples followed to report  │                        │
│ ▢ Keeps working offline       │  Username [_________]  │
│                               │  Password [______][👁] │
│ ─────────────────────────────  │  [      Log in      ]  │
│ by Infobytes Nepal Pvt. Ltd.  │                        │
│              ☎ Support ×2     │  Accounts are set up   │
│                               │  by the owner…         │
└───────────────────────────────┴────────────────────────┘
     sage-900, cream text            cream-100
```

**Rules that hold it together:**

- **Sage, never navy.** Navy means a patient is involved (§1) and nobody has signed in. The mark itself is the sanctioned exception and it arrives as artwork, not as a colour token.
- **The form comes first on a phone.** `order-1 lg:order-2` on the form, `order-2 lg:order-1` on the brand panel. Somebody opening this on the shop's tablet wants the password box, not the sales pitch. The pitch is still there, below it.
- **The clinic's own letterhead sits above the fields**, so somebody at a shared machine can see whose system this is before typing into it. Falls back to their name set in type, then to nothing — never to a placeholder. Only `company.name` and `company.logoUrl` cross to the browser; both are printed on every bill that leaves the shop, so neither is a secret, and nothing else from the company profile is sent to a page anybody can open.
- **Four or five features, never more**, each with an icon, a title and one sentence. Built by `featuresFor(modules)` in `components/auth/brand-panel.tsx` and **filtered by the modules actually switched on** — a pharmacy-only install must not be told about patients and samples, because those pages 404 for it (D-030) and the first thing a new user would learn is that the software describes itself wrongly.
- **Offline outranks Nepali dates for the last slot.** Five is the cap and a clinic with a pharmacy fills four; Bikram Sambat is table stakes for anything sold here, and billing through a power cut is not. Pinned by `tests/login-screen.test.ts`.
- **Everything is claimed in the present tense**, because everything listed is already built. A sign-in screen that advertises what is coming is the first thing a user learns not to trust.
- **The support numbers live here** because this is the screen somebody is looking at when they cannot get in — which is exactly when they are needed and exactly when a number stored inside the software is no use. They and the vendor name come from `lib/vendor.ts`, which is the only place in the product that names the maker.
- **One word for one action.** The heading, the button and its busy state all come from `strings.login` — "Log in", never a mix of "Sign in" and "Log in" on the same screen.

**Brand assets** (`public/icons/`): `logo-main.png` is the mark on light surfaces, `logo-white.png` on anything that isn't white, `favicon.png` is the round mark. The three installed-app icons and `apple-touch-icon.png` are **derived** from `favicon.png` by `scripts/make-icons.mjs` — never hand-cropped, so they cannot drift apart. The artwork spells "ClinicNP", so a pharmacy-only install falls back to the wordmark set in type (`components/ui/wordmark.tsx`) rather than showing the wrong name in a picture.
