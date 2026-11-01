/**
 * opening-batches.ts — turning opening-stock rows into batches.
 *
 * One batch on a shelf is often counted in two units: ten full strips and
 * seven loose tablets of the same batch number. The form takes that as two
 * rows, one per unit, and they must land as ONE batch holding 107 tablets —
 * not two batches with the same number, and not a refusal (D-159).
 *
 * Rows are the same batch when they name the same medicine and the same batch
 * number, ignoring case and spaces at the ends. Within one batch:
 *   - quantities are added in base units (tablets);
 *   - the cost per base unit is what the rows cost in all, divided by how many
 *     base units they hold, so a strip row and a tablet row each count at what
 *     was typed for them;
 *   - two rows in the same unit are refused: that is a copied row left
 *     unchanged, or one count typed twice, and adding them would double it;
 *   - every row must carry the same expiry and manufacture date, because a
 *     batch has one of each.
 *
 * Pure and client-safe, so the form can say the same thing the server will.
 */
import { openingLineToBase } from "@/lib/units";

export interface OpeningRow {
  itemId: string;
  brandName: string;
  batchNo: string;
  /** The unit the row was counted in. */
  unitLevel: number;
  unitName: string;
  factorToBase: number;
  qty: number;
  costPaisaPerUnit: number;
  mfgDateAd: string | null;
  expiryDateAd: string;
}

export interface OpeningBatch {
  itemId: string;
  brandName: string;
  /** As typed on the first row of the batch. */
  batchNo: string;
  mfgDateAd: string | null;
  expiryDateAd: string;
  baseQty: number;
  costPaisaPerBase: number;
  /** How many rows went into it. */
  rows: number;
}

export type GroupResult =
  | { ok: true; batches: OpeningBatch[] }
  | { ok: false; reason: string };

/** The key two rows share when they are the same batch of the same medicine. */
export function sameBatchKey(itemId: string, batchNo: string): string {
  return `${itemId}|${batchNo.trim().toUpperCase()}`;
}

export function groupOpeningRows(rows: OpeningRow[]): GroupResult {
  const groups = new Map<
    string,
    { batch: OpeningBatch; levels: Set<number>; totalPaisa: number }
  >();

  for (const r of rows) {
    const key = sameBatchKey(r.itemId, r.batchNo);
    const { baseQty } = openingLineToBase(r.qty, r.costPaisaPerUnit, r.factorToBase);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        batch: {
          itemId: r.itemId,
          brandName: r.brandName,
          batchNo: r.batchNo.trim(),
          mfgDateAd: r.mfgDateAd,
          expiryDateAd: r.expiryDateAd,
          baseQty,
          costPaisaPerBase: 0,
          rows: 1,
        },
        levels: new Set([r.unitLevel]),
        totalPaisa: r.qty * r.costPaisaPerUnit,
      });
      continue;
    }

    const name = `${r.brandName}, batch ${g.batch.batchNo}`;
    if (g.levels.has(r.unitLevel)) {
      return {
        ok: false,
        reason:
          `${name} is entered twice in ${r.unitName}. Put that count in one row; ` +
          "a second row of the same batch is for a different unit, such as the loose tablets.",
      };
    }
    if (r.expiryDateAd !== g.batch.expiryDateAd) {
      return { ok: false, reason: `${name}: every row of one batch needs the same expiry date.` };
    }
    if (r.mfgDateAd !== g.batch.mfgDateAd) {
      return {
        ok: false,
        reason: `${name}: every row of one batch needs the same manufacture date.`,
      };
    }
    g.levels.add(r.unitLevel);
    g.batch.baseQty += baseQty;
    g.batch.rows += 1;
    g.totalPaisa += r.qty * r.costPaisaPerUnit;
  }

  const batches = [...groups.values()].map(({ batch, totalPaisa }) => ({
    ...batch,
    // One row comes to exactly what openingLineToBase gives; several rows are
    // weighted by how many base units each holds.
    costPaisaPerBase: batch.baseQty > 0 ? Math.round(totalPaisa / batch.baseQty) : 0,
  }));
  return { ok: true, batches };
}
