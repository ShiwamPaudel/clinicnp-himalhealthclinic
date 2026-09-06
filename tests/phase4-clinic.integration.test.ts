/**
 * Phase 4 acceptance: the clinic back office — refunds across services, the
 * laboratory ledger, doctor payouts and the clinic reports.
 *
 * Every number here is checked against a hand calculation written into the
 * test, because "the report agrees with itself" is not the same as "the report
 * is right".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `phase4-clinic.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const TODAY_AD = "2026-08-29";
const TODAY_BS = "2083-05-13";
// The whole of BS 2083/84 in AD terms — reports filter on AD, like every
// other report in the product.
const RANGE = { fromIso: "2026-01-01", toIso: "2027-12-31" };

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

let patientId = "";
let itemId = "";
let batchId = "";

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  const res = await db().execute({ sql, args: args as never });
  return res.rows;
}

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }

  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Anita','anita','x','staff','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc1','Dr. Forty','pct_consult', 4000, 1, 't','t')`,
  );
  await raw.execute(
    `INSERT INTO lab_partners (id, name, active, created_at, updated_at)
     VALUES ('lab1','Everest Laboratory',1,'t','t')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, group_id, rate_paisa, doctor_required,
                           outsourced, default_lab_partner_id, partner_cost_paisa,
                           keeps_file, followup_days, active, created_at, updated_at)
     VALUES ('svc_opd','OPD Consultation','grp_opd', 50000, 1, 0, NULL, 0, 0, 0, 1, 't','t')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, group_id, rate_paisa, outsourced,
                           default_lab_partner_id, partner_cost_paisa, keeps_file,
                           active, created_at, updated_at)
     VALUES ('svc_cbc','CBC','grp_lab', 60000, 1, 'lab1', 40000, 1, 1, 't','t')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, group_id, rate_paisa, keeps_file,
                           active, created_at, updated_at)
     VALUES ('svc_usg','USG','grp_usg', 120000, 1, 1, 't','t')`,
  );

  itemId = ulid();
  batchId = ulid();
  await raw.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, controlled_flag,
                             shape, active, created_at, updated_at)
          VALUES (?, 'Cetamol', 'Paracetamol 500', 'Medicine', 0, 'tablet', 1, 't', 't')`,
    args: [itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 0, 'Tablet', 1, 200, 1)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO batches (id, item_id, batch_no, expiry_date_ad,
                               received_base_qty, remaining_base_qty,
                               purchase_cost_paisa_per_base, created_at)
          VALUES (?, ?, 'B1', '2027-12-31', 1000, 1000, 150, 't')`,
    args: [batchId, itemId],
  });
  raw.close();

  const { createPatient } = await import("@/lib/repos/patients");
  const p = await createPatient({
    name: "Anita Shrestha",
    sex: "f",
    ageValue: 34,
    ageUnit: "y",
    ageAsOfAd: TODAY_AD,
    dobAd: null,
    phone: "9841234567",
    address: "Bhaktapur",
    userId: "u1",
  });
  patientId = p.id;
});

async function bill(opts: {
  services?: {
    serviceId: string;
    qty?: number;
    ratePaisa: number;
    doctorId?: string | null;
    labPartnerId?: string | null;
  }[];
  medicines?: { qty: number; ratePaisa: number }[];
  dateAd?: string;
  dateBs?: string;
}) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    id: ulid(),
    dateBs: opts.dateBs ?? TODAY_BS,
    dateAd: opts.dateAd ?? TODAY_AD,
    patientName: "",
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: 0,
    lines: (opts.medicines ?? []).map((m) => ({
      id: ulid(),
      itemId,
      unitLevel: 0,
      qty: m.qty,
      ratePaisa: m.ratePaisa,
      rateOverridden: false,
      discountPaisa: 0,
    })),
    serviceLines: (opts.services ?? []).map((s) => ({
      id: ulid(),
      serviceId: s.serviceId,
      qty: s.qty ?? 1,
      ratePaisa: s.ratePaisa,
      rateOverridden: false,
      discountPaisa: 0,
      doctorId: s.doctorId ?? null,
      labPartnerId: s.labPartnerId ?? null,
      followupApplied: false,
    })),
    patientId,
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
  });
}

describe("Phase 4 — refunding a mixed bill", () => {
  it("reconciles stock, service revenue and the day's takings to a hand calculation", async () => {
    // Sell: one USG at 1200.00 + ten tablets at 2.00 = 1200 + 20 = Rs 1220.00
    const res = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
      medicines: [{ qty: 10, ratePaisa: 200 }],
    });
    expect(res.totalPaisa).toBe(122_000);

    const stockBefore = Number(
      (await q("SELECT remaining_base_qty q FROM batches WHERE id = ?", [batchId]))[0]!.q,
    );

    const svcLine = (
      await q("SELECT id, amount_paisa FROM bill_service_lines WHERE bill_id = ?", [
        res.id,
      ])
    )[0]!;
    const medLine = (
      await q("SELECT id FROM bill_lines WHERE bill_id = ?", [res.id])
    )[0]!;

    // Refund the whole USG, and return one tablet.
    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    const refund = await createSaleReturn({
      billId: res.id,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      lines: [
        {
          billLineId: medLine.id as string,
          itemId,
          returnBaseQty: 1,
          amountPaisa: 200,
        },
      ],
      serviceLines: [
        {
          billServiceLineId: svcLine.id as string,
          qty: 1,
          amountPaisa: 120_000,
        },
      ],
      userId: "u1",
    });

    // by hand: 120000 + 200 = 120200
    expect(refund.totalPaisa).toBe(120_200);

    // exactly one tablet came back to stock; the service put nothing back
    const stockAfter = Number(
      (await q("SELECT remaining_base_qty q FROM batches WHERE id = ?", [batchId]))[0]!.q,
    );
    expect(stockAfter - stockBefore).toBe(1);

    // the service revenue report nets the refund out to zero for that line
    const { serviceRevenue } = await import("@/lib/repos/clinic-reports");
    const rev = await serviceRevenue(RANGE);
    const usg = rev.find((r) => r.name === "USG")!;
    expect(usg.grossPaisa).toBe(120_000);
    expect(usg.refundedPaisa).toBe(120_000);
    expect(usg.netPaisa).toBe(0);
  });

  it("puts nothing back into stock for a service refund", async () => {
    const moves = await q(
      "SELECT COUNT(*) n FROM stock_moves WHERE reason = 'sale_return'",
    );
    // exactly the one tablet from the test above
    expect(Number(moves[0]!.n)).toBe(1);
  });
});

describe("Phase 4 — doctor payouts", () => {
  it("matches a hand calculation across ten consultations", async () => {
    for (let i = 0; i < 10; i++) {
      await bill({
        services: [
          { serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" },
        ],
      });
    }
    const { doctorPayouts } = await import("@/lib/repos/clinic-reports");
    const rows = await doctorPayouts(RANGE);
    const doc = rows.find((r) => r.doctorId === "doc1")!;

    // by hand: 10 × Rs 500.00 = Rs 5000.00 billed; 40% = Rs 2000.00
    expect(doc.billedPaisa).toBe(500_000);
    expect(doc.sharePaisa).toBe(200_000);
    expect(doc.consultations).toBe(10);
    expect(doc.basisSummary).toBe("a percentage of consultations");
  });

  it("does not move when the doctor's share is edited afterwards", async () => {
    const { updateDoctor } = await import("@/lib/repos/doctors");
    const { doctorPayouts } = await import("@/lib/repos/clinic-reports");

    await updateDoctor("doc1", {
      name: "Dr. Forty",
      qualification: "",
      specialty: "",
      nmcNo: "",
      phone: "",
      shareBasis: "pct_consult",
      shareValue: 1000, // 10% from now on
      active: true,
    });

    const rows = await doctorPayouts(RANGE);
    expect(rows.find((r) => r.doctorId === "doc1")!.sharePaisa).toBe(200_000);

    // Put the terms back, so the next test measures a 40% consultation rather
    // than inheriting this one's edit.
    await updateDoctor("doc1", {
      name: "Dr. Forty",
      qualification: "",
      specialty: "",
      nmcNo: "",
      phone: "",
      shareBasis: "pct_consult",
      shareValue: 4000,
      active: true,
    });
  });

  it("takes the share back when the consultation is refunded", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" }],
    });
    const line = (
      await q("SELECT id FROM bill_service_lines WHERE bill_id = ?", [res.id])
    )[0]!;

    const { doctorPayouts } = await import("@/lib/repos/clinic-reports");
    const before = (await doctorPayouts(RANGE)).find((r) => r.doctorId === "doc1")!;

    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    await createSaleReturn({
      billId: res.id,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      lines: [],
      serviceLines: [
        { billServiceLineId: line.id as string, qty: 1, amountPaisa: 50_000 },
      ],
      userId: "u1",
    });

    const after = (await doctorPayouts(RANGE)).find((r) => r.doctorId === "doc1")!;
    // the refunded consultation's Rs 200.00 share comes back off
    expect(before.sharePaisa - after.sharePaisa).toBe(20_000);
  });
});

describe("Phase 4 — the laboratory ledger", () => {
  it("balances twelve tests against two payments", async () => {
    for (let i = 0; i < 12; i++) {
      await bill({
        services: [
          { serviceId: "svc_cbc", ratePaisa: 60_000, labPartnerId: "lab1" },
        ],
      });
    }

    const { recordPartnerPayment, partnerStatement } = await import(
      "@/lib/repos/clinic-reports"
    );
    await recordPartnerPayment({
      partnerId: "lab1",
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      amountPaisa: 200_000,
      method: "bank",
      note: "part settlement",
      userId: "u1",
    });
    await recordPartnerPayment({
      partnerId: "lab1",
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      amountPaisa: 100_000,
      method: "cash",
      note: "",
      userId: "u1",
    });

    const st = (await partnerStatement("lab1", RANGE))!;

    // by hand: 12 tests × Rs 400.00 cost = Rs 4800.00 owed
    expect(st.testsPaisa).toBe(480_000);
    // paid Rs 2000.00 + Rs 1000.00 = Rs 3000.00
    expect(st.paymentsPaisa).toBe(300_000);
    // closing = 4800 − 3000 = Rs 1800.00
    expect(st.closingPaisa).toBe(180_000);
    // billed 12 × Rs 600.00 = Rs 7200.00; margin = 7200 − 4800 = Rs 2400.00
    expect(st.billedPaisa).toBe(720_000);
    expect(st.marginPaisa).toBe(240_000);
    // 12 tests + 2 payments on the statement
    expect(st.entries).toHaveLength(14);
    expect(st.entries.at(-1)!.runningPaisa).toBe(180_000);
  });

  it("shows the same closing balance on the all-partners view", async () => {
    const { partnerSummary } = await import("@/lib/repos/clinic-reports");
    const rows = await partnerSummary(RANGE);
    const lab = rows.find((r) => r.partnerId === "lab1")!;
    expect(lab.balancePaisa).toBe(180_000);
    expect(lab.marginPaisa).toBe(240_000);
  });

  it("drops a refunded test out of what is owed", async () => {
    const res = await bill({
      services: [
        { serviceId: "svc_cbc", ratePaisa: 60_000, labPartnerId: "lab1" },
      ],
    });
    const line = (
      await q("SELECT id FROM bill_service_lines WHERE bill_id = ?", [res.id])
    )[0]!;

    const { partnerSummary } = await import("@/lib/repos/clinic-reports");
    const before = (await partnerSummary(RANGE)).find((r) => r.partnerId === "lab1")!;

    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    await createSaleReturn({
      billId: res.id,
      dateAd: TODAY_AD,
      dateBs: TODAY_BS,
      lines: [],
      serviceLines: [
        { billServiceLineId: line.id as string, qty: 1, amountPaisa: 60_000 },
      ],
      userId: "u1",
    });

    const after = (await partnerSummary(RANGE)).find((r) => r.partnerId === "lab1")!;
    // the test was never really sent, so its Rs 400.00 cost comes off
    expect(before.balancePaisa - after.balancePaisa).toBe(40_000);
  });
});

describe("Phase 4 — patients seen", () => {
  it("counts a first-ever visit as new and the rest as returning", async () => {
    const { newVsReturning } = await import("@/lib/repos/clinic-reports");
    const r = await newVsReturning(RANGE);
    // every bill above was for the same patient, so exactly one visit was
    // their first ever
    expect(r.newPatients).toBe(1);
    expect(r.returningPatients).toBe(r.totalVisits - 1);
  });

  it("lists the visits in a register", async () => {
    const { patientVisitRegister } = await import("@/lib/repos/clinic-reports");
    const rows = await patientVisitRegister(RANGE);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.patientName).toBe("Anita Shrestha");
  });
});

describe("Phase 4 — files pending", () => {
  it("lists services that keep a file and have nothing attached", async () => {
    const { filesPending } = await import("@/lib/repos/clinic-reports");
    const rows = await filesPending();
    // CBC and USG both keep a file; the consultation does not
    expect(rows.every((r) => r.serviceName !== "OPD Consultation")).toBe(true);
    expect(rows.some((r) => r.serviceName === "CBC")).toBe(true);
    expect(rows.some((r) => r.partnerName === "Everest Laboratory")).toBe(true);
  });

  it("drops a service off the list once a file is attached to its visit", async () => {
    const { filesPending } = await import("@/lib/repos/clinic-reports");
    const before = await filesPending();
    const target = before.find((r) => r.visitId)!;

    await q(
      `INSERT INTO attachments (id, patient_id, visit_id, kind, title, file_name,
                                mime, size_bytes, blob_key, uploaded_by, created_at)
       VALUES (?, ?, ?, 'report', 'Report', 'r.pdf', 'application/pdf', 10, 'k', 'u1', 't')`,
      [ulid(), patientId, target.visitId],
    );

    const after = await filesPending();
    expect(after.length).toBeLessThan(before.length);
  });
});

describe("Phase 4 — diagnostics utilisation", () => {
  it("groups the takings by service group", async () => {
    const { diagnosticsUtilisation } = await import("@/lib/repos/clinic-reports");
    const rows = await diagnosticsUtilisation(RANGE);
    const names = rows.map((r) => r.groupName);
    expect(names).toContain("Laboratory");
    expect(names).toContain("OPD Consultation");
  });
});

describe("Phase 4 — the dashboard trend", () => {
  it("nets refunds out of both series, so the chart agrees with the tiles", async () => {
    const { trendByKind } = await import("@/lib/repos/reports");

    // A fresh day of its own, so this test does not read the others' bills.
    const DAY_AD = "2026-09-15";
    const DAY_BS = "2083-05-30";

    const sold = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
      medicines: [{ qty: 5, ratePaisa: 200 }],
      dateAd: DAY_AD,
      dateBs: DAY_BS,
    });

    const before = (await trendByKind(DAY_AD, DAY_AD))[0]!;
    expect(before.medicinePaisa).toBe(1_000);
    expect(before.servicePaisa).toBe(120_000);

    const svcLine = (
      await q("SELECT id FROM bill_service_lines WHERE bill_id = ?", [sold.id])
    )[0]!;
    const medLine = (
      await q("SELECT id FROM bill_lines WHERE bill_id = ?", [sold.id])
    )[0]!;

    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    await createSaleReturn({
      billId: sold.id,
      dateAd: DAY_AD,
      dateBs: DAY_BS,
      lines: [
        {
          billLineId: medLine.id as string,
          itemId,
          returnBaseQty: 2,
          amountPaisa: 400,
        },
      ],
      serviceLines: [
        { billServiceLineId: svcLine.id as string, qty: 1, amountPaisa: 120_000 },
      ],
      userId: "u1",
    });

    const after = (await trendByKind(DAY_AD, DAY_AD))[0]!;
    // by hand: medicines 1000 − 400 = 600; services 120000 − 120000 = 0
    expect(after.medicinePaisa).toBe(600);
    expect(after.servicePaisa).toBe(0);
  });
});

// Kept last on purpose: it closes the fiscal year, so anything billed after
// it would land in a different year from everything above.
describe("Phase 4 — refunding a closed year", () => {
  it("records the refund in the open year, naming the original invoice", async () => {
    // Sell something, then close the year it was sold in.
    const sold = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
    });
    const line = (
      await q("SELECT id FROM bill_service_lines WHERE bill_id = ?", [sold.id])
    )[0]!;

    const { closeYearAndOpenNext } = await import("@/lib/repos/fiscal");
    await closeYearAndOpenNext("u1");

    const { createSaleReturn } = await import("@/lib/repos/sale-returns");
    const refund = await createSaleReturn({
      billId: sold.id,
      dateAd: "2027-07-20",
      dateBs: "2084-04-05",
      lines: [],
      serviceLines: [
        { billServiceLineId: line.id as string, qty: 1, amountPaisa: 120_000 },
      ],
      userId: "u1",
    });

    expect(refund.totalPaisa).toBe(120_000);
    expect(refund.intoOpenYearNote).toContain("Original invoice");

    // it belongs to the year that is open now, not the closed one
    const openFy = (
      await q("SELECT id FROM fiscal_years WHERE status = 'open'")
    )[0]!;
    const soldFy = (
      await q("SELECT fiscal_year_id f FROM bills WHERE id = ?", [sold.id])
    )[0]!;
    expect(String(openFy.id)).not.toBe(String(soldFy.f));

    // the closed year's own figures are untouched
    const stillThere = await q(
      "SELECT total_paisa FROM bills WHERE id = ?",
      [sold.id],
    );
    expect(Number(stillThere[0]!.total_paisa)).toBe(120_000);
  });
});
