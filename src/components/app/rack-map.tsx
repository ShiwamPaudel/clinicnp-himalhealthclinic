"use client";

/**
 * The map needs a rack's shape and where it stands, and nothing else. Declaring
 * that here rather than taking the repo's `Rack` lets the counter pass the
 * lighter rack it carries in its offline catalog, without inventing an `active`
 * flag and a `note` it does not have.
 */
export interface MapRack {
  id: string;
  name: string;
  rows: number;
  cols: number;
  posX: number;
  posY: number;
}

export interface HighlightCell {
  rackId: string;
  row: number;
  col: number;
}

interface Props {
  racks: MapRack[];
  /** The cell to light up. Everything else dims around it. */
  highlight?: HighlightCell | null;
  /** rackId → "row:col" → how many items stand there. */
  counts?: Record<string, Record<string, number>>;
  onCellClick?: (rackId: string, row: number, col: number) => void;
  /** Small enough to sit beside the billing lines rather than fill a page. */
  compact?: boolean;
  /** Draw the rack that is being typed but does not exist yet. */
  ghost?: { name: string; rows: number; cols: number; posX: number; posY: number } | null;
}

/**
 * The shop floor, drawn the way it stands.
 *
 * Racks carry their own position, so this lays them out on a grid rather than
 * in a list: the point of a map is that it matches the room. A person looking
 * for Cetamol should be able to raise their eyes from the screen and walk to
 * the shelf without translating anything.
 *
 * The lit cell is deliberately loud — colour, ring and a label — because it is
 * read across a counter, in a hurry, often by somebody who started last week.
 */
export function RackMap({
  racks,
  highlight = null,
  counts,
  onCellClick,
  compact = false,
  ghost = null,
}: Props) {
  const all: MapRack[] = ghost
    ? [
        ...racks,
        {
          id: "__ghost__",
          name: ghost.name || "New rack",
          rows: ghost.rows,
          cols: ghost.cols,
          posX: ghost.posX,
          posY: ghost.posY,
        },
      ]
    : racks;

  if (all.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-center text-sage-500">
        No racks yet. Add one and it will be drawn here as you type.
      </p>
    );
  }

  // Positions are signed, so normalise them onto a 0-based grid for CSS.
  const minX = Math.min(...all.map((r) => r.posX));
  const minY = Math.min(...all.map((r) => r.posY));
  const cols = Math.max(...all.map((r) => r.posX)) - minX + 1;

  // 11px is the floor: this is read across a room, on a counter tablet, often
  // by somebody who started last week.
  const cell = compact ? "h-6 w-6 text-[11px]" : "h-8 w-8 text-[11px]";

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}
    >
      {all.map((rack) => {
        const isGhost = rack.id === "__ghost__";
        return (
          <div
            key={rack.id}
            style={{
              gridColumnStart: rack.posX - minX + 1,
              gridRowStart: rack.posY - minY + 1,
            }}
            className={
              "rounded-lg border p-2 " +
              (isGhost
                ? "border-dashed border-sage-300 bg-cream-50 opacity-80"
                : "border-line bg-cream-50")
            }
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-sage-900">
                {rack.name}
              </span>
              {!compact && (
                <span className="text-[11px] text-sage-500">
                  {rack.rows}×{rack.cols}
                </span>
              )}
            </div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${rack.cols}, min-content)` }}
            >
              {Array.from({ length: rack.rows }, (_, ri) =>
                Array.from({ length: rack.cols }, (__, ci) => {
                  const row = ri + 1;
                  const col = ci + 1;
                  const lit =
                    highlight != null &&
                    highlight.rackId === rack.id &&
                    highlight.row === row &&
                    highlight.col === col;
                  const n = counts?.[rack.id]?.[`${row}:${col}`] ?? 0;
                  const clickable = onCellClick && !isGhost;

                  const base =
                    "flex items-center justify-center rounded border transition-colors " +
                    cell;
                  const look = lit
                    ? "border-magenta-600 bg-magenta-100 font-bold text-magenta-700 ring-2 ring-magenta-600"
                    : n > 0
                      ? "border-sage-300 bg-sage-75 text-sage-700"
                      : "border-line bg-cream-100 text-sage-500";
                  const dim =
                    highlight != null && !lit && !isGhost ? " opacity-50" : "";

                  const label = `${rack.name} row ${row} column ${col}${
                    n > 0 ? `, ${n} item${n === 1 ? "" : "s"}` : ", empty"
                  }`;

                  if (clickable) {
                    return (
                      <button
                        key={`${row}:${col}`}
                        type="button"
                        onClick={() => onCellClick(rack.id, row, col)}
                        aria-label={label}
                        className={`${base} ${look}${dim} hover:border-sage-600`}
                      >
                        {n > 0 ? n : ""}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={`${row}:${col}`}
                      title={label}
                      className={`${base} ${look}${dim}`}
                    >
                      {lit ? "●" : n > 0 ? n : ""}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
