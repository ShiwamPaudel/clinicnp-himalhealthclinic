"use server";

/**
 * opening-actions.ts — recording the shelf as it already stands.
 *
 * Admin-only and pharmacy-only. Every line becomes a batch and one stock_move
 * with reason `opening` (0014), which is the whole point: an opening balance is
 * not a purchase, owes nobody, and must not appear in an item's history as
 * something that was bought.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { createBatchWithStock } from "@/lib/repos/batches";
import { getItem } from "@/lib/repos/items";
import { recordAudit } from "@/lib/repos/audit";
import { adToIso, toAD, bsFromDbText } from "@/lib/bs";
import { groupOpeningRows, type OpeningRow } from "@/lib/opening-batches";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  count?: number;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

const openingSchema = z.object({
  dateBs: z.string().min(1),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        unitLevel: z.number().int().min(0).max(2),
        batchNo: z.string().min(1, "Every line needs a batch number"),
        mfgDateBs: z.string(),
        expiryDateBs: z.string().min(1, "Every line needs an expiry date"),
        qty: z.number().int().positive("Enter how many"),
        costPaisaPerUnit: z.number().int().min(0),
      }),
    )
    .min(1, "Add at least one medicine"),
});

/** BS text to an ISO AD date, or null for an empty optional date. */
function isoOf(bs: string): string | null {
  if (!bs.trim()) return null;
  return adToIso(toAD(bsFromDbText(bs)));
}

export async function recordOpeningStockAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();

    const parsed = openingSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const { lines } = parsed.data;

    // Resolve every line before writing any of them. A half-entered shelf is
    // worse than a refused one: you cannot tell by looking which rows landed.
    const resolved: OpeningRow[] = [];

    for (const l of lines) {
      const item = await getItem(l.itemId);
      if (!item) return fail("One of those medicines no longer exists.");
      const unit = item.units.find((u) => u.level === l.unitLevel);
      if (!unit) {
        return fail(`${item.brandName} has no unit at that level.`);
      }

      const expiryDateAd = isoOf(l.expiryDateBs);
      if (!expiryDateAd) {
        return fail(`${item.brandName}: enter the expiry date.`);
      }
      const mfgDateAd = isoOf(l.mfgDateBs);
      if (mfgDateAd && mfgDateAd > expiryDateAd) {
        return fail(
          `${item.brandName}: it cannot expire before it was manufactured.`,
        );
      }

      resolved.push({
        itemId: item.id,
        brandName: item.brandName,
        batchNo: l.batchNo,
        unitLevel: unit.level,
        unitName: unit.name,
        factorToBase: unit.factorToBase,
        qty: l.qty,
        costPaisaPerUnit: l.costPaisaPerUnit,
        mfgDateAd,
        expiryDateAd,
      });
    }

    // Quantities and costs are stored per base unit, and the strips and loose
    // tablets of one batch become one batch (D-159), so this is converted and
    // combined once here rather than everywhere it is read.
    const grouped = groupOpeningRows(resolved);
    if (!grouped.ok) return fail(grouped.reason);

    for (const r of grouped.batches) {
      await createBatchWithStock({
        itemId: r.itemId,
        batchNo: r.batchNo,
        mfgDateAd: r.mfgDateAd,
        expiryDateAd: r.expiryDateAd,
        costPaisaPerBase: r.costPaisaPerBase,
        baseQty: r.baseQty,
        // No supplier and no purchase. That is what makes it opening stock.
        supplierId: null,
        purchaseId: null,
        userId: user.id,
        reason: "opening",
      });
    }

    await recordAudit(user.id, "stock.opening", {
      lines: resolved.length,
      batches: grouped.batches.length,
      items: grouped.batches.map((r) => r.brandName),
    });

    revalidatePath("/stock");
    revalidatePath("/stock/opening");
    revalidatePath("/stock/low");
    revalidatePath("/stock/near-expiry");
    revalidatePath("/reports/valuation");
    return { ok: true, count: grouped.batches.length };
  } catch (err) {
    if (err instanceof ModuleDisabledError) return fail(err.userMessage);
    if (err instanceof NotAuthorizedError) return fail(err.userMessage);
    console.error("[opening stock]", err);
    return fail("Something went wrong. Please try again.");
  }
}
