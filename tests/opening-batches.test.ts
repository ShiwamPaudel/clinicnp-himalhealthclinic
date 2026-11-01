/**
 * Strips and loose tablets of one batch, entered as two opening-stock rows,
 * are one batch on the shelf (D-159). The quantity it holds decides what the
 * counter can sell, so the adding-up is pinned here exactly.
 */
import { describe, it, expect } from "vitest";
import { groupOpeningRows, sameBatchKey, type OpeningRow } from "@/lib/opening-batches";
import { openingLineToBase } from "@/lib/units";

const strip = { unitLevel: 1, unitName: "Strip", factorToBase: 10 };
const tablet = { unitLevel: 0, unitName: "Tablet", factorToBase: 1 };
const box = { unitLevel: 2, unitName: "Box", factorToBase: 100 };

function row(over: Partial<OpeningRow>): OpeningRow {
  return {
    itemId: "amox",
    brandName: "Amoxil 500",
    batchNo: "B-1",
    ...strip,
    qty: 10,
    costPaisaPerUnit: 5000, // Rs 50 a strip
    mfgDateAd: "2024-11-01",
    expiryDateAd: "2029-11-30",
    ...over,
  };
}

describe("one batch counted in two units", () => {
  it("adds the loose tablets to the strips as one batch", () => {
    const r = groupOpeningRows([
      row({}),
      row({ ...tablet, qty: 7, costPaisaPerUnit: 500 }), // Rs 5 a tablet
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]).toMatchObject({
      itemId: "amox",
      batchNo: "B-1",
      baseQty: 107,
      costPaisaPerBase: 500,
      rows: 2,
      mfgDateAd: "2024-11-01",
      expiryDateAd: "2029-11-30",
    });
  });

  it("takes boxes, strips and tablets of one batch together", () => {
    const r = groupOpeningRows([
      row({ ...box, qty: 2, costPaisaPerUnit: 50000 }),
      row({}),
      row({ ...tablet, qty: 3, costPaisaPerUnit: 500 }),
    ]);
    expect(r.ok && r.batches[0]!.baseQty).toBe(2 * 100 + 10 * 10 + 3);
  });

  it("weights the cost by what each row holds", () => {
    // 10 strips at Rs 40 (400 paisa a tablet) and 20 tablets at Rs 7.
    const r = groupOpeningRows([
      row({ costPaisaPerUnit: 4000 }),
      row({ ...tablet, qty: 20, costPaisaPerUnit: 700 }),
    ]);
    // (10 × 4000 + 20 × 700) / 120 = 54000 / 120 = 450
    expect(r.ok && r.batches[0]!.costPaisaPerBase).toBe(450);
  });

  it("matches the batch number regardless of case and spaces at the ends", () => {
    const r = groupOpeningRows([row({ batchNo: "ab-12" }), row({ ...tablet, qty: 4, batchNo: " AB-12 " })]);
    expect(r.ok && r.batches.map((b) => [b.batchNo, b.baseQty])).toEqual([["ab-12", 104]]);
    expect(sameBatchKey("x", " ab-12 ")).toBe(sameBatchKey("x", "AB-12"));
  });

  it("gives a single row exactly what it gave before", () => {
    for (const [qty, cost, factor] of [[3, 1000, 3], [1, 5, 2], [7, 999, 10], [5, 0, 10]] as const) {
      const r = groupOpeningRows([row({ qty, costPaisaPerUnit: cost, factorToBase: factor })]);
      expect(r.ok && r.batches[0]).toMatchObject(openingLineToBase(qty, cost, factor));
    }
  });
});

describe("what stays separate", () => {
  it("keeps different batches, and the same batch number of a different medicine, apart", () => {
    const r = groupOpeningRows([
      row({}),
      row({ batchNo: "B-2" }),
      row({ itemId: "para", brandName: "Paracetamol", batchNo: "B-1" }),
    ]);
    expect(r.ok && r.batches.map((b) => `${b.itemId}/${b.batchNo}/${b.baseQty}`)).toEqual([
      "amox/B-1/100",
      "amox/B-2/100",
      "para/B-1/100",
    ]);
  });
});

describe("what is refused", () => {
  it("refuses the same batch twice in the same unit — a copy left unchanged", () => {
    const r = groupOpeningRows([row({}), row({ qty: 4 })]);
    expect(r).toEqual({
      ok: false,
      reason: expect.stringContaining("Amoxil 500, batch B-1 is entered twice in Strip"),
    });
  });

  it("refuses one batch with two expiry dates", () => {
    const r = groupOpeningRows([row({}), row({ ...tablet, expiryDateAd: "2030-11-30" })]);
    expect(r.ok === false && r.reason).toMatch(/same expiry date/);
  });

  it("refuses one batch with two manufacture dates, a missing one included", () => {
    const r = groupOpeningRows([row({}), row({ ...tablet, mfgDateAd: null })]);
    expect(r.ok === false && r.reason).toMatch(/same manufacture date/);
  });
});
