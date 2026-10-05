/**
 * Paying a supplier with the purchase, and setting prices from it (C-024).
 * Driven against an isolated file database through the real repositories.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made the older suites flaky.
const DB_FILE = join(__dirname, `purchase-pay.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

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

const USER = "verify-user";
const TODAY = new Date().toISOString().slice(0, 10);
let supplierId = "";
let itemId = "";

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
  await raw.execute({
    sql: `INSERT INTO users (id, name, username, password_hash, role, created_at)
          VALUES (?, 'Verifier', 'verify', 'x', 'admin', ?)`,
    args: [USER, new Date().toISOString()],
  });
  raw.close();

  const { createSupplier } = await import("@/lib/repos/suppliers");
  const { createItem } = await import("@/lib/repos/items");
  supplierId = await createSupplier({
    name: "Sample Distributors",
    panNo: "",
    phone: "",
    address: "",
    contactPerson: "",
    terms: "",
    active: true,
  });
  itemId = await createItem({
    brandName: "Sample Tab",
    genericName: "",
    category: "Medicine",
    manufacturer: "",
    minStockBaseQty: 0,
    controlledFlag: false,
    shape: "tablet",
    preferredSupplierId: supplierId,
    active: true,
    units: [
      { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 500, isDefaultSelling: false },
      { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 5500, isDefaultSelling: true },
      { level: 2, name: "Box", factorToBase: 100, sellingRatePaisa: 50000, isDefaultSelling: false },
    ],
  });
});

function line(batchNo: string) {
  return {
    itemId,
    batchNo,
    mfgDateAd: null,
    expiryDateAd: "2030-01-31",
    unitLevel: 2,
    factorToBase: 100,
    qty: 10,
    freeQty: 0,
    unitCostPaisa: 40000, // Rs 400 a box, Rs 4,000 the bill
    discountPaisa: 0,
  };
}

describe("paying the supplier with the purchase", () => {
  it("leaves the whole bill owed when nothing is paid, as before", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { supplierBalance } = await import("@/lib/repos/suppliers");
    await createPurchase({
      supplierId,
      supplierInvoiceNo: "S-1",
      dateAd: TODAY,
      dateBs: "2083-06-18",
      vatPaisa: 0,
      userId: USER,
      lines: [line("B1")],
    });
    expect(await supplierBalance(supplierId)).toBe(400000);
  });

  it("records a part payment against the purchase and owes the rest", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { supplierLedger } = await import("@/lib/repos/suppliers");
    const res = await createPurchase({
      supplierId,
      supplierInvoiceNo: "S-2",
      dateAd: TODAY,
      dateBs: "2083-06-18",
      vatPaisa: 0,
      userId: USER,
      lines: [line("B2")],
      paidNow: { amountPaisa: 150000, method: "bank" },
    });
    const { entries, balancePaisa } = await supplierLedger(supplierId);
    // 4,000 owed from before, 4,000 more, 1,500 of it paid.
    expect(balancePaisa).toBe(400000 + 400000 - 150000);
    const payment = entries.find((e) => e.kind === "payment")!;
    expect(payment.deltaPaisa).toBe(-150000);
    expect(payment.description).toBe(`Payment (bank) · Paid with purchase ${res.purchaseNo}`);
    // The purchase comes before its own payment in the ledger.
    const kinds = entries.map((e) => e.kind);
    expect(kinds.lastIndexOf("purchase")).toBeLessThan(kinds.indexOf("payment"));
  });

  it("refuses to pay more than the bill, and then writes nothing at all", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { db } = await import("@/lib/db");
    const count = async () =>
      Number(
        (await db().execute("SELECT COUNT(*) AS n FROM purchases")).rows[0]!.n,
      );
    const before = await count();
    await expect(
      createPurchase({
        supplierId,
        supplierInvoiceNo: "S-3",
        dateAd: TODAY,
        dateBs: "2083-06-18",
        vatPaisa: 0,
        userId: USER,
        lines: [line("B3")],
        paidNow: { amountPaisa: 400001, method: "cash" },
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
  });
});

describe("selling prices set from a purchase", () => {
  it("are written with the purchase, every pack in proportion", async () => {
    const { createPurchase } = await import("@/lib/repos/purchases");
    const { getItem } = await import("@/lib/repos/items");
    const { ratesFromPurchasePrice } = await import("@/lib/purchase-entry");
    const before = (await getItem(itemId))!;
    const rates = ratesFromPurchasePrice(before.units, 2, 60000)!;
    await createPurchase({
      supplierId,
      supplierInvoiceNo: "S-4",
      dateAd: TODAY,
      dateBs: "2083-06-18",
      vatPaisa: 0,
      userId: USER,
      lines: [line("B4")],
      priceUpdates: [{ itemId, rates }],
    });
    const after = (await getItem(itemId))!;
    const price = (level: number) =>
      after.units.find((u) => u.level === level)!.sellingRatePaisa;
    expect([price(0), price(1), price(2)]).toEqual([600, 6000, 60000]);
  });
});
