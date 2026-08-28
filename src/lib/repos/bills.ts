/**
 * bills.ts — sale ingest (the outbox target) and bill reads.
 *
 * Ingest is IDEMPOTENT on the bill ULID (Rules §1.8): retrying the same bill
 * twice creates exactly one bill. The server is authoritative for FEFO: it
 * re-allocates batches transactionally on receipt (Architecture §2.1/2.2).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { allocate, type FefoBatch } from "@/lib/fefo";
import { vatOf, roundToRupee } from "@/lib/money";
import { fiscalYearOf, bsFromDbText } from "@/lib/bs";
import { ensureFiscalYear } from "@/lib/repos/fiscal";
import { getCompany } from "@/lib/repos/company";

export interface IngestLine {
  id: string;
  itemId: string;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}

export interface IngestBillInput {
  id: string; // client ULID
  dateBs: string;
  dateAd: string;
  patientName: string;
  paymentMethod: "cash" | "qr" | "credit";
  tenderedPaisa: number;
  billDiscountPaisa: number;
  lines: IngestLine[];
  userId: string;
  clientCreatedAt: string;
}

export interface IngestResult {
  id: string;
  invoiceNo: number;
  fiscalLabel: string;
  totalPaisa: number;
  alreadyExisted: boolean;
}

/**
 * Thrown when a bill would sell more than the on-hand (non-expired) stock.
 * The counter blocks this before it reaches here; the server enforces it too
 * (defense-in-depth + the rare two-device offline race). Rolls the sale back.
 */
export class InsufficientStockError extends Error {
  readonly code = "insufficient_stock";
  constructor(public readonly itemIds: string[]) {
    super("insufficient stock for one or more items");
    this.name = "InsufficientStockError";
  }
}

/** Look up an existing bill's invoice number + fiscal label (for idempotent replies). */
async function existingBill(id: string): Promise<IngestResult | null> {
  const res = await db().execute({
    sql: `SELECT b.id, b.invoice_no, b.total_paisa, f.bs_label
          FROM bills b LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          WHERE b.id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    invoiceNo: Number(r.invoice_no ?? 0),
    fiscalLabel: (r.bs_label as string) ?? "",
    totalPaisa: Number(r.total_paisa),
    alreadyExisted: true,
  };
}

/**
 * Ingest a bill: assign an invoice number, run authoritative FEFO, decrement
 * stock (guarded), and write the sale + ledger — all in one transaction.
 */
export async function ingestBill(input: IngestBillInput): Promise<IngestResult> {
  // Idempotency: if this ULID is already stored, return it unchanged.
  const existing = await existingBill(input.id);
  if (existing) return existing;

  const company = await getCompany();
  const fy = await ensureFiscalYear(fiscalYearOf(bsFromDbText(input.dateBs)));

  // Resolve unit factors for every line up front (factors don't change mid-sale).
  const factorByLine = new Map<string, number>();
  for (const line of input.lines) {
    const u = await db().execute({
      sql: "SELECT factor_to_base FROM item_units WHERE item_id = ? AND level = ?",
      args: [line.itemId, line.unitLevel],
    });
    const f = u.rows[0];
    if (!f) throw new Error(`missing unit for item ${line.itemId}`);
    factorByLine.set(line.id, Number(f.factor_to_base));
  }

  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    // --- invoice number (serialized inside the write transaction) ---
    const seqRes = await tx.execute({
      sql: "SELECT next_invoice_no FROM fiscal_years WHERE id = ?",
      args: [fy.id],
    });
    const invoiceNo = Number(seqRes.rows[0]!.next_invoice_no);
    await tx.execute({
      sql: "UPDATE fiscal_years SET next_invoice_no = ? WHERE id = ?",
      args: [invoiceNo + 1, fy.id],
    });

    // --- line allocation + stock decrement ---
    let subtotal = 0;
    const shortItemIds: string[] = [];
    const lineInserts: {
      lineId: string;
      itemId: string;
      unitLevel: number;
      qty: number;
      ratePaisa: number;
      rateOverridden: boolean;
      discountPaisa: number;
      amount: number;
      shortBase: number;
      allocations: { batchId: string; baseQty: number }[];
    }[] = [];

    for (const line of input.lines) {
      const factor = factorByLine.get(line.id)!;
      const neededBase = line.qty * factor;

      const live = await tx.execute({
        sql: `SELECT id, expiry_date_ad, remaining_base_qty FROM batches
              WHERE item_id = ? AND remaining_base_qty > 0 AND expiry_date_ad >= ?
              ORDER BY expiry_date_ad ASC, id ASC`,
        args: [line.itemId, input.dateAd],
      });
      const fefoBatches: FefoBatch[] = live.rows.map((r) => ({
        id: r.id as string,
        expiryDateAd: r.expiry_date_ad as string,
        remainingBaseQty: Number(r.remaining_base_qty),
      }));

      const { allocations, shortfallBaseQty } = allocate(
        neededBase,
        fefoBatches,
        input.dateAd,
        line.overrideBatchId ? { overrideBatchId: line.overrideBatchId } : {},
      );

      // Hard block: never sell more than the on-hand, non-expired stock.
      if (shortfallBaseQty > 0) {
        if (!shortItemIds.includes(line.itemId)) shortItemIds.push(line.itemId);
        continue; // skip decrement; we'll roll back and reject below
      }

      // Guarded decrement per allocation (guard always holds inside the txn).
      for (const a of allocations) {
        await tx.execute({
          sql: `UPDATE batches SET remaining_base_qty = remaining_base_qty - ?
                WHERE id = ? AND remaining_base_qty >= ?`,
          args: [a.baseQty, a.batchId, a.baseQty],
        });
        await tx.execute({
          sql: `INSERT INTO stock_moves
                  (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
                VALUES (?, ?, ?, ?, 'sale', 'bills', ?, ?, ?)`,
          args: [ulid(), a.batchId, line.itemId, -a.baseQty, input.id, input.userId, now],
        });
      }

      const amount = Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
      subtotal += amount;
      lineInserts.push({
        lineId: line.id,
        itemId: line.itemId,
        unitLevel: line.unitLevel,
        qty: line.qty,
        ratePaisa: line.ratePaisa,
        rateOverridden: line.rateOverridden,
        discountPaisa: line.discountPaisa,
        amount,
        shortBase: shortfallBaseQty,
        allocations,
      });
    }

    // Reject the whole sale if any line couldn't be fully covered by stock.
    if (shortItemIds.length > 0) {
      throw new InsufficientStockError(shortItemIds);
    }

    // --- totals ---
    const afterBillDiscount = Math.max(0, subtotal - input.billDiscountPaisa);
    const vatPaisa = company.vatRegistered ? vatOf(afterBillDiscount) : 0;
    let total = afterBillDiscount + vatPaisa;
    if (company.roundingOn) total = roundToRupee(total);

    // --- bill header ---
    await tx.execute({
      sql: `INSERT INTO bills
              (id, invoice_no, fiscal_year_id, date_ad, date_bs, patient_name,
               subtotal_paisa, discount_paisa, vat_paisa, total_paisa,
               payment_method, tendered_paisa, status, user_id, client_created_at, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?)`,
      args: [
        input.id,
        invoiceNo,
        fy.id,
        input.dateAd,
        input.dateBs,
        input.patientName,
        subtotal,
        input.billDiscountPaisa,
        vatPaisa,
        total,
        input.paymentMethod,
        input.tenderedPaisa,
        input.userId,
        input.clientCreatedAt,
        now,
      ],
    });

    for (const li of lineInserts) {
      await tx.execute({
        sql: `INSERT INTO bill_lines
                (id, bill_id, item_id, unit_level, qty, rate_paisa, rate_overridden,
                 discount_paisa, amount_paisa, short_base_qty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          li.lineId,
          input.id,
          li.itemId,
          li.unitLevel,
          li.qty,
          li.ratePaisa,
          li.rateOverridden ? 1 : 0,
          li.discountPaisa,
          li.amount,
          li.shortBase,
        ],
      });
      for (const a of li.allocations) {
        await tx.execute({
          sql: `INSERT INTO bill_line_batches (id, bill_line_id, batch_id, base_qty)
                VALUES (?, ?, ?, ?)`,
          args: [ulid(), li.lineId, a.batchId, a.baseQty],
        });
      }
    }

    // Queue for CBMS transmission (drained by the cron only when enabled).
    // Payload is our own bill summary; the IRD field mapping is applied at send time.
    const cbmsPayload = JSON.stringify({
      billId: input.id,
      invoiceNo,
      fiscalLabel: fy.bsLabel,
      dateBs: input.dateBs,
      totalPaisa: total,
      vatPaisa,
      panNo: company.panNo,
    });
    await tx.execute({
      sql: `INSERT INTO cbms_queue (bill_id, payload_json, attempts, status, updated_at)
            VALUES (?, ?, 0, 'pending', ?)
            ON CONFLICT(bill_id) DO NOTHING`,
      args: [input.id, cbmsPayload, now],
    });

    await tx.commit();
    return {
      id: input.id,
      invoiceNo,
      fiscalLabel: fy.bsLabel,
      totalPaisa: total,
      alreadyExisted: false,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ---- reads (register + reprint) ----

export interface BillListRow {
  id: string;
  invoiceNo: number | null;
  fiscalLabel: string;
  dateBs: string;
  patientName: string;
  totalPaisa: number;
  paymentMethod: string;
  status: string;
}

function mapBillRow(r: Row): BillListRow {
  return {
    id: r.id as string,
    invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    dateBs: r.date_bs as string,
    patientName: (r.patient_name as string) ?? "",
    totalPaisa: Number(r.total_paisa),
    paymentMethod: r.payment_method as string,
    status: r.status as string,
  };
}

export async function listBills(limit = 200): Promise<BillListRow[]> {
  const res = await db().execute({
    sql: `SELECT b.*, f.bs_label FROM bills b
          LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          ORDER BY b.client_created_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(mapBillRow);
}

export interface BillDetailLine {
  id: string;
  itemId: string;
  brandName: string;
  genericName: string;
  controlled: boolean;
  unitLevel: number;
  unitName: string;
  factorToBase: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  amountPaisa: number;
  batches: { batchNo: string; expiryDateAd: string; baseQty: number; batchId: string }[];
}

export interface BillDetail extends BillListRow {
  subtotalPaisa: number;
  discountPaisa: number;
  vatPaisa: number;
  tenderedPaisa: number;
  creditSettledAt: string | null;
  userName: string;
  lines: BillDetailLine[];
}

export async function getBillDetail(id: string): Promise<BillDetail | null> {
  const head = await db().execute({
    sql: `SELECT b.*, f.bs_label, u.name AS user_name
          FROM bills b
          LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          LEFT JOIN users u ON u.id = b.user_id
          WHERE b.id = ?`,
    args: [id],
  });
  const h = head.rows[0];
  if (!h) return null;

  const lineRes = await db().execute({
    sql: `SELECT bl.*, i.brand_name, i.generic_name, i.controlled_flag,
                 iu.name AS unit_name, iu.factor_to_base
          FROM bill_lines bl
          JOIN items i ON i.id = bl.item_id
          LEFT JOIN item_units iu ON iu.item_id = bl.item_id AND iu.level = bl.unit_level
          WHERE bl.bill_id = ?`,
    args: [id],
  });

  const lines: BillDetailLine[] = [];
  for (const l of lineRes.rows) {
    const allocs = await db().execute({
      sql: `SELECT bb.base_qty, bb.batch_id, ba.batch_no, ba.expiry_date_ad
            FROM bill_line_batches bb JOIN batches ba ON ba.id = bb.batch_id
            WHERE bb.bill_line_id = ?`,
      args: [l.id as string],
    });
    lines.push({
      id: l.id as string,
      itemId: l.item_id as string,
      brandName: l.brand_name as string,
      genericName: l.generic_name as string,
      controlled: Number(l.controlled_flag) === 1,
      unitLevel: Number(l.unit_level),
      unitName: (l.unit_name as string) ?? "",
      factorToBase: Number(l.factor_to_base ?? 1),
      qty: Number(l.qty),
      ratePaisa: Number(l.rate_paisa),
      rateOverridden: Number(l.rate_overridden) === 1,
      discountPaisa: Number(l.discount_paisa),
      amountPaisa: Number(l.amount_paisa),
      batches: allocs.rows.map((a) => ({
        batchId: a.batch_id as string,
        batchNo: a.batch_no as string,
        expiryDateAd: a.expiry_date_ad as string,
        baseQty: Number(a.base_qty),
      })),
    });
  }

  return {
    ...mapBillRow(h),
    subtotalPaisa: Number(h.subtotal_paisa),
    discountPaisa: Number(h.discount_paisa),
    vatPaisa: Number(h.vat_paisa),
    tenderedPaisa: Number(h.tendered_paisa),
    creditSettledAt: (h.credit_settled_at as string | null) ?? null,
    userName: (h.user_name as string) ?? "",
    lines,
  };
}

/** Cancel a bill (Admin): restore its stock, mark Cancelled, keep the number. */
export async function cancelBill(id: string, userId: string): Promise<void> {
  const bill = await db().execute({
    sql: "SELECT status FROM bills WHERE id = ?",
    args: [id],
  });
  if (!bill.rows[0]) throw new Error("bill not found");
  if ((bill.rows[0].status as string) === "cancelled") return;

  const allocs = await db().execute({
    sql: `SELECT bb.batch_id, bb.base_qty, bl.item_id
          FROM bill_line_batches bb JOIN bill_lines bl ON bl.id = bb.bill_line_id
          WHERE bl.bill_id = ?`,
    args: [id],
  });
  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    for (const a of allocs.rows) {
      await tx.execute({
        sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ?",
        args: [Number(a.base_qty), a.batch_id as string],
      });
      await tx.execute({
        sql: `INSERT INTO stock_moves (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
              VALUES (?, ?, ?, ?, 'adjustment', 'bill_cancel', ?, ?, ?)`,
        args: [ulid(), a.batch_id as string, a.item_id as string, Number(a.base_qty), id, userId, now],
      });
    }
    await tx.execute({
      sql: "UPDATE bills SET status = 'cancelled' WHERE id = ?",
      args: [id],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'bill_cancelled', ?, ?)`,
      args: [ulid(), userId, JSON.stringify({ billId: id }), now],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export interface CreditBillRow extends BillListRow {
  ageDays: number;
}

export async function listCreditBills(todayIso: string): Promise<CreditBillRow[]> {
  const res = await db().execute(
    `SELECT b.*, f.bs_label FROM bills b
     LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
     WHERE b.payment_method = 'credit' AND b.status = 'saved' AND b.credit_settled_at IS NULL
     ORDER BY b.date_ad ASC`,
  );
  return res.rows.map((r) => {
    const row = mapBillRow(r);
    const days = Math.max(
      0,
      Math.round(
        (Date.parse(todayIso) - Date.parse(r.date_ad as string)) / 86400000,
      ),
    );
    return { ...row, ageDays: days };
  });
}

export async function settleCreditBill(id: string): Promise<void> {
  await db().execute({
    sql: "UPDATE bills SET credit_settled_at = ? WHERE id = ? AND payment_method = 'credit'",
    args: [new Date().toISOString(), id],
  });
}
