/**
 * Racks: drawing the shop, putting medicines on shelves, and everything that
 * has to keep agreeing about where a thing is.
 *
 * The first version of the rack feature stored racks and drew them and had no
 * way to put a medicine on one, so the map was decoration. These tests are
 * about the link — the three columns on `items` — and about the ways it can
 * quietly come apart: a shelf off the end of its rack, a rack that shrinks
 * under the items standing on it, a rack renamed while a counter is still
 * showing the old name out of its offline cache.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `racks.${process.pid}-${Date.now()}.db`);

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });

  const c = createClient({ url: `file:${DB_FILE}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migrations, f), "utf8"))) {
      await c.execute(stmt);
    }
  }
  c.close();
});

/** A minimal sellable item; the units are the smallest legal hierarchy. */
async function makeItem(
  brandName: string,
  cell?: { rackId: string; row: number; col: number },
) {
  const { createItem } = await import("@/lib/repos/items");
  return createItem({
    brandName,
    genericName: `${brandName} generic`,
    category: "Medicine",
    manufacturer: "",
    rack: "",
    rackId: cell?.rackId ?? null,
    rackRow: cell?.row ?? null,
    rackCol: cell?.col ?? null,
    minStockBaseQty: 0,
    controlledFlag: false,
    preferredSupplierId: null,
    active: true,
    shape: "tablet",
    units: [
      {
        level: 0,
        name: "Tablet",
        factorToBase: 1,
        sellingRatePaisa: 100,
        isDefaultSelling: true,
      },
    ],
  });
}

describe("putting a medicine on a shelf", () => {
  it("saves the cell with the item and reads it back", async () => {
    const { createRack } = await import("@/lib/repos/racks");
    const { getItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Rack 1",
      rows: 4,
      cols: 5,
      posX: 0,
      posY: 0,
    });
    const itemId = await makeItem("Cetamol", { rackId, row: 2, col: 3 });

    const item = await getItem(itemId);
    expect(item?.rackId).toBe(rackId);
    expect(item?.rackRow).toBe(2);
    expect(item?.rackCol).toBe(3);
  });

  it("refuses a shelf that is off the end of the rack", async () => {
    const { createRack, assertCellFits, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Small",
      rows: 2,
      cols: 2,
      posX: 5,
      posY: 5,
    });

    // R3C1 does not exist on a 2x2 rack.
    await expect(
      assertCellFits({ rackId, row: 3, col: 1 }),
    ).rejects.toBeInstanceOf(BadCellError);
    await expect(
      assertCellFits({ rackId, row: 1, col: 9 }),
    ).rejects.toBeInstanceOf(BadCellError);

    await expect(assertCellFits({ rackId, row: 2, col: 2 })).resolves.toEqual({
      rackId,
      row: 2,
      col: 2,
    });
  });

  it("names the rack when it refuses, because there are several", async () => {
    const { createRack, assertCellFits } = await import("@/lib/repos/racks");
    const rackId = await createRack({
      name: "By the window",
      rows: 2,
      cols: 2,
      posX: 7,
      posY: 5,
    });
    await expect(
      assertCellFits({ rackId, row: 5, col: 5 }),
    ).rejects.toThrow(/By the window/);
  });

  it("refuses a rack chosen without a shelf, rather than dropping it", async () => {
    const { createRack, assertCellFits, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Half-answered",
      rows: 3,
      cols: 3,
      posX: 6,
      posY: 5,
    });
    // Somebody picked the rack and was interrupted. Storing no shelf at all
    // would lose their intent without saying so.
    await expect(
      assertCellFits({ rackId, row: null, col: null }),
    ).rejects.toBeInstanceOf(BadCellError);
  });

  it("treats no rack at all as an ordinary item, not an error", async () => {
    const { assertCellFits } = await import("@/lib/repos/racks");
    await expect(
      assertCellFits({ rackId: null, row: null, col: null }),
    ).resolves.toEqual({ rackId: null, row: null, col: null });
  });

  it("takes an item off its shelf without touching anything else", async () => {
    const { createRack, setItemCell } = await import("@/lib/repos/racks");
    const { getItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Rack 9",
      rows: 2,
      cols: 2,
      posX: 9,
      posY: 9,
    });
    const itemId = await makeItem("Removable", { rackId, row: 1, col: 1 });

    await setItemCell(itemId, { rackId: null, row: null, col: null });
    const item = await getItem(itemId);
    expect(item?.rackId).toBeNull();
    expect(item?.rackRow).toBeNull();
    expect(item?.rackCol).toBeNull();
    // Still a perfectly good medicine.
    expect(item?.brandName).toBe("Removable");
    expect(item?.active).toBe(true);
    expect(item?.units).toHaveLength(1);
  });
});

describe("a rack that changes under the things standing on it", () => {
  it("refuses to shrink a rack that would strand an item", async () => {
    const { createRack, updateRack, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Shrinking",
      rows: 4,
      cols: 4,
      posX: 1,
      posY: 1,
    });
    await makeItem("Stranded", { rackId, row: 4, col: 4 });

    await expect(
      updateRack(rackId, {
        name: "Shrinking",
        rows: 2,
        cols: 2,
        posX: 1,
        posY: 1,
        active: true,
      }),
    ).rejects.toBeInstanceOf(BadCellError);

    // Growing is always fine.
    await updateRack(rackId, {
      name: "Shrinking",
      rows: 6,
      cols: 6,
      posX: 1,
      posY: 1,
      active: true,
    });
  });

  it("leaves items intact when their rack is deleted", async () => {
    const { createRack, deleteRack } = await import("@/lib/repos/racks");
    const { getItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Doomed",
      rows: 2,
      cols: 2,
      posX: 2,
      posY: 2,
    });
    const itemId = await makeItem("Survivor", { rackId, row: 1, col: 2 });

    await deleteRack(rackId);
    const item = await getItem(itemId);
    expect(item).not.toBeNull();
    expect(item?.brandName).toBe("Survivor");
    expect(item?.rackId).toBeNull();
    expect(item?.rackRow).toBeNull();
  });

  it("will not stand two racks in the same spot", async () => {
    const { createRack, RackPositionTakenError } = await import(
      "@/lib/repos/racks"
    );
    await createRack({ name: "First", rows: 1, cols: 1, posX: 20, posY: 20 });
    await expect(
      createRack({ name: "Second", rows: 1, cols: 1, posX: 20, posY: 20 }),
    ).rejects.toBeInstanceOf(RackPositionTakenError);
  });
});

describe("what the counter is told", () => {
  it("changes the catalog version when a rack is merely renamed", async () => {
    const { createRack, updateRack } = await import("@/lib/repos/racks");
    const { catalogVersion } = await import("@/lib/repos/batches");

    const rackId = await createRack({
      name: "Front",
      rows: 2,
      cols: 2,
      posX: 30,
      posY: 30,
    });
    const before = await catalogVersion();

    // Renaming touches no item and no stock move. Without racks in the version
    // string the counter would keep lighting up "Front" for as long as its
    // cache lasted.
    await new Promise((r) => setTimeout(r, 5));
    await updateRack(rackId, {
      name: "Fridge",
      rows: 2,
      cols: 2,
      posX: 30,
      posY: 30,
      active: true,
    });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("changes the catalog version when a rack is deleted", async () => {
    const { createRack, deleteRack } = await import("@/lib/repos/racks");
    const { catalogVersion } = await import("@/lib/repos/batches");

    const rackId = await createRack({
      name: "Temporary",
      rows: 1,
      cols: 1,
      posX: 31,
      posY: 30,
    });
    const before = await catalogVersion();
    await deleteRack(rackId);
    expect(await catalogVersion()).not.toBe(before);
  });

  it("carries the shelf and the racks in the catalog snapshot", async () => {
    const { createRack } = await import("@/lib/repos/racks");
    const { catalogSnapshot } = await import("@/lib/repos/catalog");

    const rackId = await createRack({
      name: "Catalogued",
      rows: 3,
      cols: 3,
      posX: 40,
      posY: 40,
    });
    const itemId = await makeItem("Findable", { rackId, row: 3, col: 2 });

    const snap = await catalogSnapshot(false);
    expect(snap.racks.find((r) => r.id === rackId)).toMatchObject({
      name: "Catalogued",
      rows: 3,
      cols: 3,
    });
    expect(snap.items.find((i) => i.id === itemId)?.cell).toEqual({
      rackId,
      row: 3,
      col: 2,
    });

    // An item with no shelf says so explicitly rather than being absent.
    const loose = await makeItem("Loose");
    const snap2 = await catalogSnapshot(false);
    expect(snap2.items.find((i) => i.id === loose)?.cell).toBeNull();
  });
});

describe("the shelf list", () => {
  it("walks racks in floor order and puts the unshelved last", async () => {
    const { createRack, shelfRows } = await import("@/lib/repos/racks");
    const c = createClient({ url: `file:${DB_FILE}` });
    await c.execute("DELETE FROM items");
    await c.execute("DELETE FROM racks");
    c.close();

    // Drawn deliberately out of order: the near rack is created last.
    const far = await createRack({
      name: "Back wall",
      rows: 2,
      cols: 2,
      posX: 1,
      posY: 1,
    });
    const near = await createRack({
      name: "By the door",
      rows: 2,
      cols: 2,
      posX: 0,
      posY: 0,
    });

    await makeItem("Zinc", { rackId: far, row: 1, col: 1 });
    await makeItem("Aspirin", { rackId: near, row: 2, col: 1 });
    await makeItem("Bandage", { rackId: near, row: 1, col: 1 });
    await makeItem("Homeless");

    const rows = await shelfRows();
    expect(rows.map((r) => r.brandName)).toEqual([
      // By the door first (posY 0), top shelf before the one below it
      "Bandage",
      "Aspirin",
      // then the back wall
      "Zinc",
      // and last, the work remaining
      "Homeless",
    ]);
    expect(rows.at(-1)?.rackId).toBeNull();
    expect(rows[0]?.rackName).toBe("By the door");
  });
});
