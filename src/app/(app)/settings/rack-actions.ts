"use server";

/**
 * rack-actions.ts — drawing the shop floor, and saying what is kept where.
 *
 * Admin-only and pharmacy-only: a clinic-only install has no shelves of
 * medicine to map, and its route returns 404 rather than an empty screen.
 *
 * Two screens use these. Settings → Shop layout draws the furniture; Stock →
 * Shelves puts medicines on it. That split is deliberate — the room is a
 * setting, what is in it is stock.
 */
import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import {
  createRack,
  updateRack,
  deleteRack,
  getRack,
  rackItemCount,
  setItemLocation,
  BadCellError,
  RackPositionTakenError,
} from "@/lib/repos/racks";
import { rackSchema, itemLocationSchema } from "@/lib/validators";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof BadCellError) return fail(err.userMessage);
  if (err instanceof RackPositionTakenError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  console.error("[rack action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveRackAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const parsed = rackSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    if (id) {
      await updateRack(id, parsed.data);
      await recordAudit(user.id, "rack.update", { id, name: parsed.data.name });
    } else {
      const newId = await createRack(parsed.data);
      await recordAudit(user.id, "rack.create", { id: newId, name: parsed.data.name });
    }
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function deleteRackAction(id: string): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const rack = await getRack(id);
    if (!rack) return fail("That rack is already gone.");

    // Deleting is allowed even with items on it — they simply lose their
    // shelf — but the person should be told how many before they do it, and
    // the screen asks. This is the last line of defence, not the first.
    const n = await rackItemCount(id);
    await deleteRack(id);
    await recordAudit(user.id, "rack.delete", {
      id,
      name: rack.name,
      itemsLeftWithoutShelf: n,
    });
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    revalidatePath("/items");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function setItemLocationAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const parsed = itemLocationSchema.safeParse(input);
    if (!parsed.success) return fail("Please choose a shelf, or none at all.");
    const { itemId, rackId, row, col, note } = parsed.data;
    await setItemLocation(itemId, { rackId, row, col, note });
    await recordAudit(user.id, "item.shelf", {
      itemId,
      cell: rackId ? `R${row}C${col}` : null,
      note: note || null,
    });
    revalidatePath("/stock/shelves");
    revalidatePath("/settings/racks");
    revalidatePath(`/items/${itemId}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}
