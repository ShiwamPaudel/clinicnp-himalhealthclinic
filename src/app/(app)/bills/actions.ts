"use server";

import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  requireUser,
  NotAuthorizedError,
} from "@/lib/session";
import { cancelBill, settleCreditBill } from "@/lib/repos/bills";
import { createSaleReturn } from "@/lib/repos/sale-returns";
import { adToIso, toAD, bsFromDbText, bsToDbText, today } from "@/lib/bs";
import { z } from "zod";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  returnNo?: number;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[bills action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function cancelBillAction(id: string): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    await cancelBill(id, admin.id);
    revalidatePath(`/bills/${id}`);
    revalidatePath("/bills");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function settleCreditAction(id: string): Promise<ActionResult> {
  try {
    await assertAdmin();
    await settleCreditBill(id);
    revalidatePath("/bills/credit");
    revalidatePath(`/bills/${id}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

const saleReturnSchema = z.object({
  billId: z.string().min(1),
  lines: z
    .array(
      z.object({
        billLineId: z.string().min(1),
        itemId: z.string().min(1),
        returnBaseQty: z.number().int().min(1),
        amountPaisa: z.number().int().min(0),
      }),
    )
    .min(1, "Choose at least one line to return"),
});

export async function createSaleReturnAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = saleReturnSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const bs = bsToDbText(today());
    const res = await createSaleReturn({
      billId: parsed.data.billId,
      dateBs: bs,
      dateAd: adToIso(toAD(bsFromDbText(bs))),
      lines: parsed.data.lines,
      userId: user.id,
    });
    revalidatePath(`/bills/${parsed.data.billId}`);
    revalidatePath("/bills");
    return { ok: true, returnNo: res.returnNo };
  } catch (err) {
    return handle(err);
  }
}
