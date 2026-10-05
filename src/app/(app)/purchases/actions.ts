"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getItem } from "@/lib/repos/items";
import {
  createPurchase,
  createPurchaseReturn,
  purchaseTotals,
  type PurchaseLineInput,
} from "@/lib/repos/purchases";
import { recordAudit } from "@/lib/repos/audit";
import { ratesFromPurchasePrice } from "@/lib/purchase-entry";
import { purchaseSchema, purchaseReturnSchema } from "@/lib/validators";
import { adToIso, toAD, bsFromDbText } from "@/lib/bs";
import { vatOf } from "@/lib/money";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
  purchaseNo?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[purchases action]", err);
  return fail("Something went wrong. Please try again.");
}

function bsToAdIso(bsText: string): string {
  return adToIso(toAD(bsFromDbText(bsText)));
}

export async function createPurchaseAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    const lines: PurchaseLineInput[] = [];
    // New selling prices, by item. Worked out against the prices on the
    // server, never the ones the form was loaded with.
    const priceUpdates = new Map<
      string,
      { brandName: string; rates: { level: number; sellingRatePaisa: number }[] }
    >();
    for (const l of d.lines) {
      // Resolve factorToBase server-side (don't trust the client).
      const item = await getItem(l.itemId);
      if (!item) return fail("One of the items no longer exists.");
      const unit = item.units.find((u) => u.level === l.unitLevel);
      if (!unit) return fail("Pick a valid unit for each line.");
      const rates = l.sellingRatePaisa
        ? ratesFromPurchasePrice(item.units, l.unitLevel, l.sellingRatePaisa)
        : null;
      if (rates) {
        const earlier = priceUpdates.get(item.id);
        // Two batches of one medicine on one bill can share a price, but not
        // carry two different ones: only one of them could win.
        if (earlier && JSON.stringify(earlier.rates) !== JSON.stringify(rates)) {
          return fail(
            `${item.brandName} is on this bill twice with two different selling prices. Make them the same.`,
          );
        }
        priceUpdates.set(item.id, { brandName: item.brandName, rates });
      }
      lines.push({
        itemId: l.itemId,
        batchNo: l.batchNo,
        mfgDateAd: l.mfgDateBs ? bsToAdIso(l.mfgDateBs) : null,
        expiryDateAd: bsToAdIso(l.expiryDateBs),
        unitLevel: l.unitLevel,
        factorToBase: unit.factorToBase,
        qty: l.qty,
        freeQty: l.freeQty,
        unitCostPaisa: l.unitCostPaisa,
        discountPaisa: l.discountPaisa,
      });
    }

    const netSubtotal = lines.reduce(
      (s, l) => s + l.qty * l.unitCostPaisa - l.discountPaisa,
      0,
    );
    // The supplier's own order: lines, then the discount on the whole bill,
    // then VAT on what is left (D-143). Every invoice from Himal's
    // distributors reads this way — "Discount", then "Taxable Amount",
    // then "VAT".
    if (d.billDiscountPaisa > netSubtotal) {
      return fail(
        "The discount is more than the bill. Check the discount against the invoice.",
      );
    }
    const taxable = netSubtotal - d.billDiscountPaisa;
    const vatPaisa = d.applyVat ? vatOf(taxable) : 0;
    const totalPaisa = purchaseTotals(
      lines,
      vatPaisa,
      d.billDiscountPaisa,
      d.roundingPaisa,
    ).totalPaisa;
    if (d.paidNowPaisa > totalPaisa) {
      return fail(
        "The amount paid is more than the bill. Check the amount, or record the extra as a payment on the supplier page.",
      );
    }

    const res = await createPurchase({
      supplierId: d.supplierId,
      supplierInvoiceNo: d.supplierInvoiceNo,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      vatPaisa,
      billDiscountPaisa: d.billDiscountPaisa,
      roundingPaisa: d.roundingPaisa,
      lines,
      userId: user.id,
      priceUpdates: [...priceUpdates].map(([itemId, p]) => ({
        itemId,
        rates: p.rates,
      })),
      paidNow:
        d.paidNowPaisa > 0
          ? { amountPaisa: d.paidNowPaisa, method: d.paidNowMethod }
          : undefined,
    });

    if (priceUpdates.size > 0) {
      await recordAudit(user.id, "items.pricing", {
        source: "purchase",
        purchaseNo: res.purchaseNo,
        items: priceUpdates.size,
        names: [...priceUpdates.values()].slice(0, 20).map((p) => p.brandName),
      });
    }

    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath(`/suppliers/${d.supplierId}`);
    if (priceUpdates.size > 0) revalidatePath("/items");
    return { ok: true, id: res.id, purchaseNo: res.purchaseNo };
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseReturnAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const parsed = purchaseReturnSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;
    const id = await createPurchaseReturn({
      supplierId: d.supplierId,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      reason: d.reason,
      lines: d.lines,
      userId: user.id,
    });
    revalidatePath("/purchases");
    revalidatePath("/stock");
    revalidatePath(`/suppliers/${d.supplierId}`);
    return { ok: true, id };
  } catch (err) {
    return handle(err);
  }
}
