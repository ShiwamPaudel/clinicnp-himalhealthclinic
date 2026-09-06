"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { createItem, updateItem } from "@/lib/repos/items";
import { assertCellFits, BadCellError } from "@/lib/repos/racks";
import { itemSchema } from "@/lib/validators";
import { validateHierarchy } from "@/lib/units";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof BadCellError) return fail(err.userMessage);
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[items action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveItemAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    await assertAdmin();
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    // Exactly one default selling unit.
    const defaults = data.units.filter((u) => u.isDefaultSelling);
    if (defaults.length !== 1) {
      return fail("Pick exactly one default selling unit.");
    }
    const hierarchyError = validateHierarchy(data.units);
    if (hierarchyError) return fail(hierarchyError);

    // A shelf that is not on the rack is refused here rather than written and
    // discovered later by somebody standing in front of the wrong shelf. A rack
    // chosen without a cell is refused too, not quietly dropped: half a shelf
    // is somebody who meant to finish and was interrupted.
    const cell = await assertCellFits({
      rackId: data.rackId,
      row: data.rackRow,
      col: data.rackCol,
    });
    const withCell = {
      ...data,
      rackId: cell.rackId,
      rackRow: cell.row,
      rackCol: cell.col,
    };

    if (data.id) {
      await updateItem(data.id, withCell);
      revalidatePath(`/items/${data.id}`);
      revalidatePath("/items");
      revalidatePath("/settings/racks");
      return { ok: true, id: data.id };
    }
    const id = await createItem(withCell);
    revalidatePath("/items");
    revalidatePath("/settings/racks");
    return { ok: true, id };
  } catch (err) {
    return handle(err);
  }
}
