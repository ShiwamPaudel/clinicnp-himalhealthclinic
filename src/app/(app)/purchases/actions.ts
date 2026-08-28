"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { getItem } from "@/lib/repos/items";
import {
  createPurchase,
  createPurchaseReturn,
  type PurchaseLineInput,
} from "@/lib/repos/purchases";
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
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[purchases action]", err);
  return fail("Something went wrong. Please try again.");
}

function bsToAdIso(bsText: string): string {
  return adToIso(toAD(bsFromDbText(bsText)));
}

export async function createPurchaseAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    const lines: PurchaseLineInput[] = [];
    for (const l of d.lines) {
      // Resolve factorToBase server-side (don't trust the client).
      const item = await getItem(l.itemId);
      if (!item) return fail("One of the items no longer exists.");
      const unit = item.units.find((u) => u.level === l.unitLevel);
      if (!unit) return fail("Pick a valid unit for each line.");
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
    const vatPaisa = d.applyVat ? vatOf(netSubtotal) : 0;

    const res = await createPurchase({
      supplierId: d.supplierId,
      supplierInvoiceNo: d.supplierInvoiceNo,
      dateBs: d.dateBs,
      dateAd: bsToAdIso(d.dateBs),
      vatPaisa,
      lines,
      userId: user.id,
    });

    revalidatePath("/purchases");
    revalidatePath("/stock");
    return { ok: true, id: res.id, purchaseNo: res.purchaseNo };
  } catch (err) {
    return handle(err);
  }
}

export async function createPurchaseReturnAction(
  input: unknown,
): Promise<ActionResult> {
  try {
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
