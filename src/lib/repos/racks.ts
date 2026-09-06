/**
 * racks.ts — the shop floor.
 *
 * A rack is a grid with a position in the room. The position is the whole
 * point: a map drawn in a different order from the shop is slower to read than
 * no map, because the person has to translate it. So racks carry `pos_x` and
 * `pos_y` in rack-widths, and a rack added to the left of the first one gets
 * -1 rather than renumbering everything that already exists.
 *
 * Rows and columns are numbered from 1 and shown as "R2C3". They are not
 * lettered: the person reading it is looking at a shelf across a room, often
 * in a hurry, and digits survive that better than "B3" does.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export interface Rack {
  id: string;
  name: string;
  rows: number;
  cols: number;
  posX: number;
  posY: number;
  note: string;
  active: boolean;
}

export interface RackInput {
  name: string;
  rows: number;
  cols: number;
  posX: number;
  posY: number;
  note?: string;
  active?: boolean;
}

/** Where one item sits. Null cell means the item simply has no shelf. */
export interface ItemCell {
  rackId: string | null;
  row: number | null;
  col: number | null;
}

export const MAX_RACK_SIDE = 26;

function mapRack(r: Row): Rack {
  return {
    id: r.id as string,
    name: r.name as string,
    rows: Number(r.rows_count),
    cols: Number(r.cols_count),
    posX: Number(r.pos_x),
    posY: Number(r.pos_y),
    note: (r.note as string) ?? "",
    active: Number(r.active) === 1,
  };
}

/** A cell that is off the end of its rack, or on no rack at all. */
export class BadCellError extends Error {
  code = "bad_cell" as const;
  userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

/** Two racks cannot stand in the same place on the floor. */
export class RackPositionTakenError extends Error {
  code = "rack_position_taken" as const;
  userMessage = "There is already a rack in that spot.";
}

export async function listRacks(includeInactive = false): Promise<Rack[]> {
  const res = await db().execute(
    includeInactive
      ? "SELECT * FROM racks ORDER BY pos_y, pos_x, name"
      : "SELECT * FROM racks WHERE active = 1 ORDER BY pos_y, pos_x, name",
  );
  return res.rows.map(mapRack);
}

export async function getRack(id: string): Promise<Rack | null> {
  const res = await db().execute({
    sql: "SELECT * FROM racks WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapRack(res.rows[0]) : null;
}

function assertSide(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 1 || n > MAX_RACK_SIDE) {
    throw new BadCellError(
      `A rack can have between 1 and ${MAX_RACK_SIDE} ${what}.`,
    );
  }
}

export async function createRack(input: RackInput): Promise<string> {
  assertSide(input.rows, "rows");
  assertSide(input.cols, "columns");
  const taken = await db().execute({
    sql: "SELECT id FROM racks WHERE pos_x = ? AND pos_y = ?",
    args: [input.posX, input.posY],
  });
  if (taken.rows[0]) throw new RackPositionTakenError();

  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO racks
            (id, name, rows_count, cols_count, pos_x, pos_y, note, active,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name.trim(),
      input.rows,
      input.cols,
      input.posX,
      input.posY,
      input.note?.trim() ?? "",
      input.active === false ? 0 : 1,
      now,
      now,
    ],
  });
  return id;
}

export async function updateRack(id: string, input: RackInput): Promise<void> {
  assertSide(input.rows, "rows");
  assertSide(input.cols, "columns");

  const taken = await db().execute({
    sql: "SELECT id FROM racks WHERE pos_x = ? AND pos_y = ? AND id <> ?",
    args: [input.posX, input.posY, id],
  });
  if (taken.rows[0]) throw new RackPositionTakenError();

  // Shrinking a rack can strand items on cells that no longer exist. Say so
  // rather than quietly leaving a medicine pointing at a shelf that is gone.
  const stranded = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM items
          WHERE rack_id = ? AND (rack_row > ? OR rack_col > ?)`,
    args: [id, input.rows, input.cols],
  });
  const n = Number(stranded.rows[0]?.n ?? 0);
  if (n > 0) {
    throw new BadCellError(
      n === 1
        ? "One item is on a shelf that would no longer exist. Move it first."
        : `${n} items are on shelves that would no longer exist. Move them first.`,
    );
  }

  await db().execute({
    sql: `UPDATE racks
             SET name = ?, rows_count = ?, cols_count = ?, pos_x = ?, pos_y = ?,
                 note = ?, active = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name.trim(),
      input.rows,
      input.cols,
      input.posX,
      input.posY,
      input.note?.trim() ?? "",
      input.active === false ? 0 : 1,
      new Date().toISOString(),
      id,
    ],
  });
}

export async function rackItemCount(id: string): Promise<number> {
  const res = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM items WHERE rack_id = ?",
    args: [id],
  });
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Remove a rack. Items standing on it lose their cell but keep everything
 * else — an item without a shelf is ordinary, not broken.
 */
export async function deleteRack(id: string): Promise<void> {
  await db().batch([
    {
      sql: "UPDATE items SET rack_id = NULL, rack_row = NULL, rack_col = NULL WHERE rack_id = ?",
      args: [id],
    },
    { sql: "DELETE FROM racks WHERE id = ?", args: [id] },
  ]);
}

/**
 * Check a cell before anything is written to an item.
 *
 * Two screens put medicines on shelves — the item form and the shelf inspector
 * on the racks page — and a third will exist the moment somebody imports a
 * price list. They all come through here, so a rule added once is a rule
 * everywhere. Returns the normalised cell, with a null rack meaning no shelf.
 */
export async function assertCellFits(cell: ItemCell): Promise<ItemCell> {
  if (cell.rackId === null || cell.rackId === "") {
    return { rackId: null, row: null, col: null };
  }
  const rack = await getRack(cell.rackId);
  if (!rack) throw new BadCellError("That rack no longer exists.");
  const { row, col } = cell;
  if (row === null || col === null) {
    throw new BadCellError("Choose a row and a column, or no rack at all.");
  }
  if (row < 1 || row > rack.rows || col < 1 || col > rack.cols) {
    throw new BadCellError(
      `${rack.name} has ${rack.rows} rows and ${rack.cols} columns, so R${row}C${col} is not on it.`,
    );
  }
  return { rackId: rack.id, row, col };
}

/** Put an item on a shelf, or take it off one by passing a null rack. */
export async function setItemCell(
  itemId: string,
  cell: ItemCell,
): Promise<void> {
  const fitted = await assertCellFits(cell);
  await db().execute({
    sql: "UPDATE items SET rack_id = ?, rack_row = ?, rack_col = ?, updated_at = ? WHERE id = ?",
    args: [
      fitted.rackId,
      fitted.row,
      fitted.col,
      new Date().toISOString(),
      itemId,
    ],
  });
}

// Re-exported so server callers can keep importing it from the repo, while the
// counter — which cannot import a server-only module — reads the same function.
export { cellLabel } from "@/lib/rack-label";

export interface ShelfItem {
  itemId: string;
  brandName: string;
  genericName: string;
}

/** Everything standing on one cell, for the shelf view. */
export async function itemsOnCell(
  rackId: string,
  row: number,
  col: number,
): Promise<ShelfItem[]> {
  const res = await db().execute({
    sql: `SELECT id, brand_name, generic_name FROM items
          WHERE rack_id = ? AND rack_row = ? AND rack_col = ? AND active = 1
          ORDER BY brand_name`,
    args: [rackId, row, col],
  });
  return res.rows.map((r) => ({
    itemId: r.id as string,
    brandName: r.brand_name as string,
    genericName: (r.generic_name as string) ?? "",
  }));
}

/** How many items stand on each cell of each rack, for the settings preview. */
export async function cellCounts(): Promise<
  Record<string, Record<string, number>>
> {
  const res = await db().execute(
    `SELECT rack_id, rack_row, rack_col, COUNT(*) AS n
       FROM items
      WHERE rack_id IS NOT NULL AND active = 1
      GROUP BY rack_id, rack_row, rack_col`,
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of res.rows) {
    const rackId = r.rack_id as string;
    out[rackId] ??= {};
    out[rackId][`${Number(r.rack_row)}:${Number(r.rack_col)}`] = Number(r.n);
  }
  return out;
}

/**
 * One row per active item, in the order a person walks the shop: rack by rack
 * across the floor, then down each rack, then across each shelf. Items with no
 * shelf sort last, because during setup they are the list of work remaining
 * rather than a place to visit.
 */
export interface ShelfRow {
  itemId: string;
  brandName: string;
  genericName: string;
  category: string;
  /** the free-text note from before racks existed, kept and shown, never lost */
  shelfNote: string;
  rackId: string | null;
  rackName: string | null;
  row: number | null;
  col: number | null;
}

export async function shelfRows(): Promise<ShelfRow[]> {
  const res = await db().execute(
    `SELECT i.id, i.brand_name, i.generic_name, i.category, i.rack AS shelf_note,
            i.rack_id, i.rack_row, i.rack_col, r.name AS rack_name
       FROM items i
       LEFT JOIN racks r ON r.id = i.rack_id
      WHERE i.active = 1
      ORDER BY (i.rack_id IS NULL), r.pos_y, r.pos_x, r.name,
               i.rack_row, i.rack_col, i.brand_name`,
  );
  return res.rows.map((r) => ({
    itemId: r.id as string,
    brandName: r.brand_name as string,
    genericName: (r.generic_name as string) ?? "",
    category: (r.category as string) ?? "",
    shelfNote: (r.shelf_note as string) ?? "",
    rackId: (r.rack_id as string | null) ?? null,
    rackName: (r.rack_name as string | null) ?? null,
    row: r.rack_row === null ? null : Number(r.rack_row),
    col: r.rack_col === null ? null : Number(r.rack_col),
  }));
}
