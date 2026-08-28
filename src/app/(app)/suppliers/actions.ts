"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import {
  createSupplier,
  updateSupplier,
  recordSupplierPayment,
} from "@/lib/repos/suppliers";
import { supplierSchema, supplierPaymentSchema } from "@/lib/validators";
import { adToIso, toAD, bsFromDbText } from "@/lib/bs";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[suppliers action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveSupplierAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const { id, ...data } = parsed.data;
    if (id) {
      await updateSupplier(id, data);
      revalidatePath(`/suppliers/${id}`);
      revalidatePath("/suppliers");
      return { ok: true, id };
    }
    const newId = await createSupplier(data);
    revalidatePath("/suppliers");
    return { ok: true, id: newId };
  } catch (err) {
    return handle(err);
  }
}

export async function recordPaymentAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    const parsed = supplierPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;
    await recordSupplierPayment({
      supplierId: d.supplierId,
      dateBs: d.dateBs,
      dateAd: adToIso(toAD(bsFromDbText(d.dateBs))),
      amountPaisa: d.amountPaisa,
      method: d.method,
      note: d.note,
      userId: user.id,
    });
    revalidatePath(`/suppliers/${d.supplierId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
