"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getBatch, writeOffBatch } from "@/lib/repos/batches";
import { createPurchaseReturn } from "@/lib/repos/purchases";
import { adToIso, toAD, bsFromDbText, today, bsToDbText } from "@/lib/bs";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[stock action]", err);
  return fail("Something went wrong. Please try again.");
}

/** Write off an expired batch's remaining stock (disposal). Admin only. */
export async function writeOffBatchAction(
  batchId: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const batch = await getBatch(batchId);
    if (!batch) return fail("That batch no longer exists.");
    if (batch.remainingBaseQty <= 0) return fail("Nothing left to write off.");
    await writeOffBatch(batchId, batch.itemId, batch.remainingBaseQty, user.id);
    // record the disposal reason in the audit trail via stock_moves reason already;
    // reason text kept for the toast/UX
    void reason;
    revalidatePath("/stock/expired");
    revalidatePath("/stock");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/** Return an expired batch to its supplier (creates a purchase return). Admin only. */
export async function returnExpiredBatchAction(
  batchId: string,
): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();
    const batch = await getBatch(batchId);
    if (!batch) return fail("That batch no longer exists.");
    if (batch.remainingBaseQty <= 0) return fail("Nothing left to return.");
    if (!batch.supplierId) return fail("This batch has no supplier on record.");
    const bs = bsToDbText(today());
    await createPurchaseReturn({
      supplierId: batch.supplierId,
      dateBs: bs,
      dateAd: adToIso(toAD(bsFromDbText(bs))),
      reason: "expired",
      lines: [
        {
          batchId: batch.id,
          itemId: batch.itemId,
          baseQty: batch.remainingBaseQty,
          costPaisa: batch.remainingBaseQty * batch.costPaisaPerBase,
        },
      ],
      userId: user.id,
    });
    revalidatePath("/stock/expired");
    revalidatePath("/stock");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
