/**
 * purchases.ts — purchase entry (stock in) and purchase returns.
 * A purchase creates one batch per line and raises stock via stock_moves,
 * all inside a single atomic libSQL batch (Architecture §2.2).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { InStatement, Row } from "@/lib/db";
import {
  getOpenFiscalYear,
  bootstrapCurrentFiscalYear,
} from "@/lib/repos/fiscal";
import { applyStockMove } from "@/lib/repos/batches";

export interface PurchaseLineInput {
  itemId: string;
  batchNo: string;
  mfgDateAd: string | null;
  expiryDateAd: string;
  unitLevel: number;
  factorToBase: number;
  qty: number; // paid quantity in the chosen unit
  freeQty: number; // bonus quantity in the chosen unit
  unitCostPaisa: number; // cost per chosen unit
  discountPaisa: number; // per-line discount
}

export interface PurchaseInput {
  supplierId: string;
  supplierInvoiceNo: string;
  dateAd: string;
  dateBs: string;
  vatPaisa: number;
  lines: PurchaseLineInput[];
  userId: string;
}

export interface PurchaseTotals {
  subtotalPaisa: number;
  discountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
}

/** Compute a line's base quantities and per-base cost (bonus units lower per-base cost). */
function lineMath(l: PurchaseLineInput) {
  const paidBase = l.qty * l.factorToBase;
  const freeBase = l.freeQty * l.factorToBase;
  const totalBase = paidBase + freeBase;
  const lineCost = Math.max(0, l.qty * l.unitCostPaisa - l.discountPaisa);
  const costPerBase = totalBase > 0 ? Math.round(lineCost / totalBase) : 0;
  return { totalBase, lineCost, costPerBase };
}

export function purchaseTotals(
  lines: PurchaseLineInput[],
  vatPaisa: number,
): PurchaseTotals {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    subtotal += l.qty * l.unitCostPaisa;
    discount += l.discountPaisa;
  }
  const net = subtotal - discount;
  return {
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    vatPaisa,
    totalPaisa: net + vatPaisa,
  };
}

/** Create a purchase, its batches, stock moves, and lines atomically. */
export async function createPurchase(
  input: PurchaseInput,
): Promise<{ id: string; purchaseNo: string }> {
  // Purchases are booked into the open year. A database that has never had one
  // (a fresh install) bootstraps the current year rather than refusing.
  const fy = (await getOpenFiscalYear()) ?? (await bootstrapCurrentFiscalYear());
  const seq = fy.nextPurchaseNo;
  const purchaseNo = fy
    ? `PI-${fy.bsLabel}-${String(seq).padStart(6, "0")}`
    : `PI-${String(seq).padStart(6, "0")}`;

  const totals = purchaseTotals(input.lines, input.vatPaisa);
  const purchaseId = ulid();
  const now = new Date().toISOString();

  const stmts: InStatement[] = [];
  stmts.push({
    sql: `INSERT INTO purchases
            (id, purchase_no, supplier_id, supplier_invoice_no, date_ad, date_bs,
             subtotal_paisa, discount_paisa, vat_paisa, total_paisa, user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      purchaseId,
      purchaseNo,
      input.supplierId,
      input.supplierInvoiceNo,
      input.dateAd,
      input.dateBs,
      totals.subtotalPaisa,
      totals.discountPaisa,
      totals.vatPaisa,
      totals.totalPaisa,
      input.userId,
      now,
    ],
  });

  for (const l of input.lines) {
    const { totalBase, costPerBase } = lineMath(l);
    const batchId = ulid();
    stmts.push({
      sql: `INSERT INTO batches
              (id, item_id, batch_no, mfg_date_ad, expiry_date_ad,
               purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty,
               supplier_id, purchase_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        batchId,
        l.itemId,
        l.batchNo,
        l.mfgDateAd,
        l.expiryDateAd,
        costPerBase,
        totalBase,
        totalBase,
        input.supplierId,
        purchaseId,
        now,
      ],
    });
    stmts.push({
      sql: `INSERT INTO stock_moves
              (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
            VALUES (?, ?, ?, ?, 'purchase', 'purchases', ?, ?, ?)`,
      args: [ulid(), batchId, l.itemId, totalBase, purchaseId, input.userId, now],
    });
    stmts.push({
      sql: `INSERT INTO purchase_lines
              (id, purchase_id, item_id, batch_id, unit_level, qty, free_qty, cost_paisa, discount_paisa)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        purchaseId,
        l.itemId,
        batchId,
        l.unitLevel,
        l.qty,
        l.freeQty,
        l.unitCostPaisa,
        l.discountPaisa,
      ],
    });
  }

  // advance the purchase sequence (guarded against a concurrent writer)
  if (fy) {
    stmts.push({
      sql: `UPDATE fiscal_years SET next_purchase_no = next_purchase_no + 1
            WHERE id = ? AND next_purchase_no = ?`,
      args: [fy.id, seq],
    });
  }

  await db().batch(stmts);
  return { id: purchaseId, purchaseNo };
}

export interface PurchaseListRow {
  id: string;
  purchaseNo: string | null;
  supplierName: string;
  supplierInvoiceNo: string;
  dateBs: string;
  dateAd: string;
  totalPaisa: number;
}

export async function listPurchases(): Promise<PurchaseListRow[]> {
  const res = await db().execute(
    `SELECT p.id, p.purchase_no, p.supplier_invoice_no, p.date_bs, p.date_ad,
            p.total_paisa, s.name AS supplier_name
     FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
     ORDER BY p.date_ad DESC, p.created_at DESC`,
  );
  return res.rows.map((r: Row) => ({
    id: r.id as string,
    purchaseNo: (r.purchase_no as string | null) ?? null,
    supplierName: r.supplier_name as string,
    supplierInvoiceNo: r.supplier_invoice_no as string,
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    totalPaisa: Number(r.total_paisa),
  }));
}

export interface PurchaseReturnLineInput {
  batchId: string;
  itemId: string;
  baseQty: number;
  costPaisa: number;
}

export interface PurchaseReturnInput {
  supplierId: string;
  dateAd: string;
  dateBs: string;
  reason: string;
  lines: PurchaseReturnLineInput[];
  userId: string;
}

/** Record a purchase return: stock down (guarded), header + lines, ledger credited. */
export async function createPurchaseReturn(
  input: PurchaseReturnInput,
): Promise<string> {
  const returnId = ulid();
  const now = new Date().toISOString();
  const total = input.lines.reduce((s, l) => s + l.costPaisa, 0);

  await db().execute({
    sql: `INSERT INTO purchase_returns
            (id, return_no, supplier_id, date_ad, date_bs, reason, total_paisa, user_id, created_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      returnId,
      input.supplierId,
      input.dateAd,
      input.dateBs,
      input.reason,
      total,
      input.userId,
      now,
    ],
  });

  for (const l of input.lines) {
    await applyStockMove({
      batchId: l.batchId,
      itemId: l.itemId,
      baseQtyDelta: -l.baseQty,
      reason: "purchase_return",
      refTable: "purchase_returns",
      refId: returnId,
      userId: input.userId,
    });
    await db().execute({
      sql: `INSERT INTO purchase_return_lines
              (id, purchase_return_id, batch_id, base_qty, cost_paisa)
            VALUES (?, ?, ?, ?, ?)`,
      args: [ulid(), returnId, l.batchId, l.baseQty, l.costPaisa],
    });
  }

  return returnId;
}
