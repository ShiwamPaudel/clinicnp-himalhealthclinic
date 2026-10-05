/**
 * purchase-entry.ts — the arithmetic behind a purchase line, shared by the
 * form (which shows it) and the server (which saves it). Client-safe.
 */
import { bsToDbText, toBS } from "@/lib/bs";

/** How far ahead a new line's expiry starts, before it is changed to the real one. */
export const DEFAULT_EXPIRY_YEARS = 4;

/**
 * Four years from today, as BS text. Worked out on the English calendar and
 * converted, because BS months differ in length from year to year: the 32nd
 * of a month this year may not exist in the same month four years on.
 */
export function defaultExpiryBs(now: Date = new Date()): string {
  const ahead = new Date(now.getFullYear() + DEFAULT_EXPIRY_YEARS, now.getMonth(), now.getDate());
  return bsToDbText(toBS(ahead));
}

/**
 * What one unit really cost: the bonus units and the line discount both make
 * each unit cheaper than the rate printed on the bill.
 */
export function effectiveUnitCostPaisa(
  qty: number,
  freeQty: number,
  unitCostPaisa: number,
  discountPaisa: number,
): number {
  const units = qty + freeQty;
  if (units <= 0) return unitCostPaisa;
  return Math.max(0, qty * unitCostPaisa - discountPaisa) / units;
}

/**
 * Margin on the selling price: (selling - cost) / selling. Cost 80 and selling
 * 100 is 20%. Null when there is no selling price to divide by.
 */
export function marginPercent(costPaisa: number, sellingPaisa: number): number | null {
  if (!(sellingPaisa > 0)) return null;
  return ((sellingPaisa - costPaisa) / sellingPaisa) * 100;
}

export interface UnitPrice {
  level: number;
  factorToBase: number;
  sellingRatePaisa: number;
}

/**
 * The item's new prices when a purchase line sets the selling price of one
 * pack. Every other pack is worked out from it in proportion (Box Rs 500 of
 * ten strips makes a strip Rs 50), so the packs never contradict each other.
 * Null when the price typed is the price the pack already has, or when the
 * pack does not exist. A price left as it was changes nothing at all, not
 * even a smaller pack the shop priced by hand (a strip at Rs 55 where the
 * box works out at Rs 50 a strip stays at Rs 55).
 */
export function ratesFromPurchasePrice(
  units: UnitPrice[],
  level: number,
  sellingRatePaisa: number,
): { level: number; sellingRatePaisa: number }[] | null {
  const bought = units.find((u) => u.level === level);
  if (!bought || !(sellingRatePaisa > 0)) return null;
  if (bought.sellingRatePaisa === sellingRatePaisa) return null;
  return units.map((u) => ({
    level: u.level,
    sellingRatePaisa:
      u.level === level
        ? sellingRatePaisa
        : Math.round((sellingRatePaisa * u.factorToBase) / bought.factorToBase),
  }));
}
