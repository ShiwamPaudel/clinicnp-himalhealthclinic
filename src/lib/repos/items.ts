/**
 * items.ts — item master + unit hierarchy. All SQL for items/item_units.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { asItemShape, type ItemShape } from "@/lib/item-shape";

export type Category = "Medicine" | "Consumable" | "Other";

export interface ItemUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface Item {
  id: string;
  brandName: string;
  genericName: string;
  category: Category;
  manufacturer: string;
  /**
   * The free-text shelf note from before racks were drawable. Kept, shown and
   * still editable when no racks exist: a shop that wrote "behind the counter"
   * should not lose it because a newer, better field arrived.
   */
  rack: string;
  /** The drawn shelf. Null when the item is not on the map. */
  rackId: string | null;
  rackRow: number | null;
  rackCol: number | null;
  minStockBaseQty: number;
  controlledFlag: boolean;
  preferredSupplierId: string | null;
  active: boolean;
  shape: ItemShape;
  units: ItemUnit[];
}

export interface ItemInput {
  brandName: string;
  genericName: string;
  category: Category;
  manufacturer: string;
  rack: string;
  rackId: string | null;
  rackRow: number | null;
  rackCol: number | null;
  minStockBaseQty: number;
  controlledFlag: boolean;
  preferredSupplierId: string | null;
  active: boolean;
  shape: ItemShape;
  units: ItemUnit[];
}

function mapItem(r: Row): Omit<Item, "units"> {
  return {
    id: r.id as string,
    brandName: r.brand_name as string,
    genericName: r.generic_name as string,
    category: r.category as Category,
    manufacturer: r.manufacturer as string,
    rack: r.rack as string,
    rackId: (r.rack_id as string | null) ?? null,
    rackRow: r.rack_row === null ? null : Number(r.rack_row),
    rackCol: r.rack_col === null ? null : Number(r.rack_col),
    minStockBaseQty: Number(r.min_stock_base_qty),
    controlledFlag: Number(r.controlled_flag) === 1,
    preferredSupplierId: (r.preferred_supplier_id as string | null) ?? null,
    active: Number(r.active) === 1,
    shape: asItemShape(r.shape),
  };
}

function mapUnit(r: Row): ItemUnit {
  return {
    level: Number(r.level),
    name: r.name as string,
    factorToBase: Number(r.factor_to_base),
    sellingRatePaisa: Number(r.selling_rate_paisa),
    isDefaultSelling: Number(r.is_default_selling) === 1,
  };
}

async function unitsFor(itemId: string): Promise<ItemUnit[]> {
  const res = await db().execute({
    sql: "SELECT * FROM item_units WHERE item_id = ? ORDER BY level ASC",
    args: [itemId],
  });
  return res.rows.map(mapUnit);
}

export async function listItems(includeInactive = false): Promise<Item[]> {
  const sql = includeInactive
    ? "SELECT * FROM items ORDER BY brand_name ASC"
    : "SELECT * FROM items WHERE active = 1 ORDER BY brand_name ASC";
  const res = await db().execute(sql);
  const items = res.rows.map(mapItem);
  // fetch all units in one pass
  const unitRes = await db().execute(
    "SELECT * FROM item_units ORDER BY level ASC",
  );
  const byItem = new Map<string, ItemUnit[]>();
  for (const r of unitRes.rows) {
    const id = r.item_id as string;
    if (!byItem.has(id)) byItem.set(id, []);
    byItem.get(id)!.push(mapUnit(r));
  }
  return items.map((i) => ({ ...i, units: byItem.get(i.id) ?? [] }));
}

export async function getItem(id: string): Promise<Item | null> {
  const res = await db().execute({
    sql: "SELECT * FROM items WHERE id = ?",
    args: [id],
  });
  if (!res.rows[0]) return null;
  return { ...mapItem(res.rows[0]), units: await unitsFor(id) };
}

async function writeUnits(itemId: string, units: ItemUnit[]): Promise<void> {
  await db().execute({
    sql: "DELETE FROM item_units WHERE item_id = ?",
    args: [itemId],
  });
  for (const u of units) {
    await db().execute({
      sql: `INSERT INTO item_units
              (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ulid(),
        itemId,
        u.level,
        u.name,
        u.factorToBase,
        u.sellingRatePaisa,
        u.isDefaultSelling ? 1 : 0,
      ],
    });
  }
}

export async function createItem(input: ItemInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO items
            (id, brand_name, generic_name, category, manufacturer, rack,
             rack_id, rack_row, rack_col,
             min_stock_base_qty, controlled_flag, preferred_supplier_id, active, shape, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.brandName,
      input.genericName,
      input.category,
      input.manufacturer,
      input.rack,
      input.rackId,
      input.rackRow,
      input.rackCol,
      input.minStockBaseQty,
      input.controlledFlag ? 1 : 0,
      input.preferredSupplierId,
      input.active ? 1 : 0,
      input.shape,
      now,
      now,
    ],
  });
  await writeUnits(id, input.units);
  return id;
}

export async function updateItem(
  id: string,
  input: ItemInput,
): Promise<void> {
  await db().execute({
    sql: `UPDATE items SET
            brand_name = ?, generic_name = ?, category = ?, manufacturer = ?,
            rack = ?, rack_id = ?, rack_row = ?, rack_col = ?,
            min_stock_base_qty = ?, controlled_flag = ?,
            preferred_supplier_id = ?, active = ?, shape = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      input.brandName,
      input.genericName,
      input.category,
      input.manufacturer,
      input.rack,
      input.rackId,
      input.rackRow,
      input.rackCol,
      input.minStockBaseQty,
      input.controlledFlag ? 1 : 0,
      input.preferredSupplierId,
      input.active ? 1 : 0,
      input.shape,
      new Date().toISOString(),
      id,
    ],
  });
  await writeUnits(id, input.units);
}
