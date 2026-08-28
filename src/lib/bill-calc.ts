/**
 * bill-calc.ts — pure calculations for the active bill. Uses the REAL shared
 * fefo/units/money code (Rules §6: never mock FEFO/unit math in POS previews).
 */
import { allocate, type FefoBatch, type Allocation } from "@/lib/fefo";
import { vatOf, roundToRupee } from "@/lib/money";
import type { PosItem, PosUnit } from "@/lib/pos-types";

export interface BillLine {
  lineId: string;
  item: PosItem;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}

export function unitByLevel(item: PosItem, level: number): PosUnit | undefined {
  return item.units.find((u) => u.level === level);
}

export function defaultUnit(item: PosItem): PosUnit {
  return item.units.find((u) => u.isDefaultSelling) ?? item.units[0]!;
}

/** Base-unit quantity a line consumes from stock. */
export function lineBaseQty(line: BillLine): number {
  const u = unitByLevel(line.item, line.unitLevel);
  return line.qty * (u?.factorToBase ?? 1);
}

/** Line money amount (qty × rate − discount), never negative. */
export function lineAmountPaisa(line: BillLine): number {
  return Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
}

export interface LinePreview {
  allocations: Allocation[];
  shortfallBaseQty: number;
  /** total sellable base stock for this item right now */
  availableBaseQty: number;
}

/** FEFO preview for a line, using the item's cached batches. */
export function linePreview(line: BillLine, todayIso: string): LinePreview {
  const fefoBatches: FefoBatch[] = line.item.batches.map((b) => ({
    id: b.id,
    expiryDateAd: b.expiryDateAd,
    remainingBaseQty: b.remainingBaseQty,
  }));
  const available = fefoBatches
    .filter((b) => b.expiryDateAd >= todayIso)
    .reduce((s, b) => s + b.remainingBaseQty, 0);
  const { allocations, shortfallBaseQty } = allocate(
    lineBaseQty(line),
    fefoBatches,
    todayIso,
    line.overrideBatchId ? { overrideBatchId: line.overrideBatchId } : {},
  );
  return { allocations, shortfallBaseQty, availableBaseQty: available };
}

export interface BillTotals {
  subtotalPaisa: number;
  billDiscountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
}

export interface BillConfig {
  vatRegistered: boolean;
  roundingOn: boolean;
}

export function billTotals(
  lines: BillLine[],
  billDiscountPaisa: number,
  config: BillConfig,
): BillTotals {
  const subtotal = lines.reduce((s, l) => s + lineAmountPaisa(l), 0);
  const afterDiscount = Math.max(0, subtotal - billDiscountPaisa);
  const vat = config.vatRegistered ? vatOf(afterDiscount) : 0;
  let total = afterDiscount + vat;
  if (config.roundingOn) total = roundToRupee(total);
  return {
    subtotalPaisa: subtotal,
    billDiscountPaisa,
    vatPaisa: vat,
    totalPaisa: total,
  };
}
