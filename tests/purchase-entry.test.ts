/**
 * The purchase line's own arithmetic (C-024): the margin shown under the
 * selling price, the prices a purchase sets, and where a new expiry starts.
 */
import { describe, it, expect } from "vitest";
import {
  defaultExpiryBs,
  effectiveUnitCostPaisa,
  marginPercent,
  ratesFromPurchasePrice,
} from "@/lib/purchase-entry";
import { bsFromDbText, toAD } from "@/lib/bs";

const BOX_OF_STRIPS = [
  { level: 0, factorToBase: 1, sellingRatePaisa: 500 }, // tablet Rs 5
  { level: 1, factorToBase: 10, sellingRatePaisa: 5500 }, // strip Rs 55, priced by hand
  { level: 2, factorToBase: 100, sellingRatePaisa: 50000 }, // box Rs 500
];

describe("margin under the selling price", () => {
  it("is taken on the selling price", () => {
    expect(marginPercent(8000, 10000)).toBe(20); // cost 80, sell 100
  });

  it("goes below nothing when the price is under cost", () => {
    expect(marginPercent(12000, 10000)).toBe(-20);
  });

  it("is not shown without a selling price", () => {
    expect(marginPercent(8000, 0)).toBeNull();
  });

  it("counts the bonus units and the line discount into the real cost", () => {
    // 10 bought at Rs 100 with 2 free and Rs 100 off: Rs 900 for 12 units.
    expect(effectiveUnitCostPaisa(10, 2, 10000, 10000)).toBe(7500);
    expect(effectiveUnitCostPaisa(10, 0, 10000, 0)).toBe(10000);
  });
});

describe("the prices a purchase sets", () => {
  it("changes nothing when the price was left as it was", () => {
    // Not even the strip priced by hand at Rs 55.
    expect(ratesFromPurchasePrice(BOX_OF_STRIPS, 2, 50000)).toBeNull();
  });

  it("works every other pack out from the one bought", () => {
    expect(ratesFromPurchasePrice(BOX_OF_STRIPS, 2, 60000)).toEqual([
      { level: 0, sellingRatePaisa: 600 },
      { level: 1, sellingRatePaisa: 6000 },
      { level: 2, sellingRatePaisa: 60000 },
    ]);
  });

  it("works upwards as well as down when a smaller pack was bought", () => {
    expect(ratesFromPurchasePrice(BOX_OF_STRIPS, 1, 6000)).toEqual([
      { level: 0, sellingRatePaisa: 600 },
      { level: 1, sellingRatePaisa: 6000 },
      { level: 2, sellingRatePaisa: 60000 },
    ]);
  });

  it("rounds a pack that does not divide evenly to the nearest paisa", () => {
    const rates = ratesFromPurchasePrice(BOX_OF_STRIPS, 2, 43700)!;
    expect(rates.find((r) => r.level === 0)!.sellingRatePaisa).toBe(437);
  });

  it("ignores no price, and a pack the item does not have", () => {
    expect(ratesFromPurchasePrice(BOX_OF_STRIPS, 2, 0)).toBeNull();
    expect(ratesFromPurchasePrice(BOX_OF_STRIPS, 3, 1000)).toBeNull();
  });
});

describe("where a new line's expiry starts", () => {
  it("is four years from today", () => {
    const now = new Date(2026, 9, 4); // 4 October 2026
    const ad = toAD(bsFromDbText(defaultExpiryBs(now)));
    expect([ad.getFullYear(), ad.getMonth(), ad.getDate()]).toEqual([2030, 9, 4]);
  });

  it("lands on a real date from the last day of a long month", () => {
    const now = new Date(2026, 6, 31); // 31 July 2026
    const ad = toAD(bsFromDbText(defaultExpiryBs(now)));
    expect([ad.getFullYear(), ad.getMonth(), ad.getDate()]).toEqual([2030, 6, 31]);
  });
});
