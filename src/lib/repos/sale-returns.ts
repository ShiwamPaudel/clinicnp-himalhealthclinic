/**
 * sale-returns.ts — return sold items. Stock goes back to the SAME batch it was
 * sold from (PRD 4.3.6). Day/sales figures adjust because reports net out returns.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";

export interface SaleReturnLineInput {
  billLineId: string;
  itemId: string;
  /** base units to return for this line (<= sold − already returned) */
  returnBaseQty: number;
  amountPaisa: number;
}

export interface SaleReturnInput {
  billId: string;
  dateAd: string;
  dateBs: string;
  lines: SaleReturnLineInput[];
  userId: string;
}

/** base units already returned per bill line, keyed by bill_line_id. */
export async function returnedBaseByLine(
  billId: string,
): Promise<Map<string, number>> {
  const res = await db().execute({
    sql: `SELECT srl.bill_line_id, SUM(srl.base_qty) AS qty
          FROM sale_return_lines srl
          JOIN sale_returns sr ON sr.id = srl.sale_return_id
          WHERE sr.bill_id = ?
          GROUP BY srl.bill_line_id`,
    args: [billId],
  });
  const map = new Map<string, number>();
  for (const r of res.rows) map.set(r.bill_line_id as string, Number(r.qty));
  return map;
}

export async function createSaleReturn(
  input: SaleReturnInput,
): Promise<{ id: string; returnNo: number; totalPaisa: number }> {
  // fiscal year + SR sequence come from the original bill
  const billRes = await db().execute({
    sql: "SELECT fiscal_year_id FROM bills WHERE id = ?",
    args: [input.billId],
  });
  const fyId = billRes.rows[0]?.fiscal_year_id as number | undefined;

  const returnId = ulid();
  const now = new Date().toISOString();
  const total = input.lines.reduce((s, l) => s + l.amountPaisa, 0);

  const tx = await db().transaction("write");
  try {
    let returnNo = 0;
    if (fyId != null) {
      const seq = await tx.execute({
        sql: "SELECT next_return_no FROM fiscal_years WHERE id = ?",
        args: [fyId],
      });
      returnNo = Number(seq.rows[0]!.next_return_no);
      await tx.execute({
        sql: "UPDATE fiscal_years SET next_return_no = ? WHERE id = ?",
        args: [returnNo + 1, fyId],
      });
    }

    await tx.execute({
      sql: `INSERT INTO sale_returns (id, return_no, bill_id, date_ad, date_bs, total_paisa, user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [returnId, returnNo || null, input.billId, input.dateAd, input.dateBs, total, input.userId, now],
    });

    for (const line of input.lines) {
      if (line.returnBaseQty <= 0) continue;
      // return stock to the ORIGINAL batches of this bill line, in allocation order
      const allocs = await tx.execute({
        sql: `SELECT batch_id, base_qty FROM bill_line_batches WHERE bill_line_id = ? ORDER BY id`,
        args: [line.billLineId],
      });
      let remaining = line.returnBaseQty;
      const perBaseAmount =
        line.returnBaseQty > 0 ? line.amountPaisa / line.returnBaseQty : 0;
      for (const a of allocs.rows) {
        if (remaining <= 0) break;
        const give = Math.min(remaining, Number(a.base_qty));
        remaining -= give;
        await tx.execute({
          sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ?",
          args: [give, a.batch_id as string],
        });
        await tx.execute({
          sql: `INSERT INTO stock_moves (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
                VALUES (?, ?, ?, ?, 'sale_return', 'sale_returns', ?, ?, ?)`,
          args: [ulid(), a.batch_id as string, line.itemId, give, returnId, input.userId, now],
        });
        await tx.execute({
          sql: `INSERT INTO sale_return_lines (id, sale_return_id, bill_line_id, batch_id, base_qty, amount_paisa)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [ulid(), returnId, line.billLineId, a.batch_id as string, give, Math.round(give * perBaseAmount)],
        });
      }
    }

    await tx.commit();
    return { id: returnId, returnNo, totalPaisa: total };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}