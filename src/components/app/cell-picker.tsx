"use client";

/**
 * cell-picker.tsx — "where is this kept", the one control.
 *
 * A shop that has drawn its racks gets the map: pick the rack, then click the
 * shelf. A shop that has not gets the free-text box it always had, and a line
 * saying what drawing the racks would buy it. Both write real data; neither is
 * a placeholder for the other.
 *
 * The free-text note is never destroyed. When a shop draws racks after years of
 * typing "behind the counter", that sentence stays visible next to the map
 * until somebody decides to clear it. Losing what a person typed in order to
 * tidy up a schema is not an upgrade.
 */
import { useMemo } from "react";
import { MapPin, X } from "lucide-react";
import Link from "next/link";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RackMap } from "@/components/app/rack-map";
import type { Rack } from "@/lib/repos/racks";

export interface CellValue {
  rackId: string | null;
  row: number | null;
  col: number | null;
}

export const NO_CELL: CellValue = { rackId: null, row: null, col: null };

/** How a chosen cell reads in a sentence. Empty when there is no cell. */
export function cellText(racks: Rack[], value: CellValue): string {
  if (!value.rackId || value.row === null || value.col === null) return "";
  const rack = racks.find((r) => r.id === value.rackId);
  if (!rack) return "";
  return `${rack.name} · R${value.row}C${value.col}`;
}

function clamp(n: number, max: number): number {
  return Math.max(1, Math.min(n, max));
}

export function CellPicker({
  racks,
  value,
  onChange,
  shelfNote,
  onShelfNoteChange,
  counts,
}: {
  racks: Rack[];
  value: CellValue;
  onChange: (next: CellValue) => void;
  shelfNote: string;
  onShelfNoteChange: (next: string) => void;
  /** rackId → "row:col" → how many other items stand there. */
  counts?: Record<string, Record<string, number>>;
}) {
  const chosen = useMemo(
    () => racks.find((r) => r.id === value.rackId) ?? null,
    [racks, value.rackId],
  );

  // No racks drawn: the free-text note is the whole control, exactly as before.
  if (racks.length === 0) {
    return (
      <Field label="Shelf note" htmlFor="shelf-note">
        <Input
          id="shelf-note"
          value={shelfNote}
          onChange={(e) => onShelfNoteChange(e.target.value)}
          placeholder="e.g. behind the counter"
        />
        <p className="mt-1.5 text-[12px] text-sage-500">
          Draw your racks in{" "}
          <Link
            href="/settings/racks"
            className="underline hover:text-sage-700"
          >
            Settings → Racks
          </Link>{" "}
          and the counter can light up the shelf instead.
        </p>
      </Field>
    );
  }

  function pickRack(rackId: string) {
    if (rackId === "") {
      onChange(NO_CELL);
      return;
    }
    const rack = racks.find((r) => r.id === rackId);
    if (!rack) return;
    // Moving to a smaller rack must not leave the item off the end of it.
    onChange({
      rackId,
      row: clamp(value.row ?? 1, rack.rows),
      col: clamp(value.col ?? 1, rack.cols),
    });
  }

  function pickSide(which: "row" | "col", entry: string) {
    if (!chosen) return;
    const max = which === "row" ? chosen.rows : chosen.cols;
    const n = Number(entry.replace(/\D/g, ""));
    if (!n) {
      onChange({ ...value, [which]: null });
      return;
    }
    onChange({ ...value, [which]: clamp(n, max) });
  }

  const label = cellText(racks, value);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
        <Field label="Rack" htmlFor="cell-rack">
          <Select
            id="cell-rack"
            value={value.rackId ?? ""}
            onChange={(e) => pickRack(e.target.value)}
          >
            <option value="">— Not on a rack —</option>
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Row" htmlFor="cell-row">
          <Input
            id="cell-row"
            numeric
            inputMode="numeric"
            disabled={!chosen}
            className="disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-sage-400"
            value={value.row === null ? "" : String(value.row)}
            onChange={(e) => pickSide("row", e.target.value)}
          />
        </Field>
        <Field label="Column" htmlFor="cell-col">
          <Input
            id="cell-col"
            numeric
            inputMode="numeric"
            disabled={!chosen}
            className="disabled:cursor-not-allowed disabled:bg-cream-200 disabled:text-sage-400"
            value={value.col === null ? "" : String(value.col)}
            onChange={(e) => pickSide("col", e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-[8px] border border-line bg-cream-100 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-sage-500">
          <MapPin className="h-3.5 w-3.5" />
          {label
            ? `Kept at ${label}. Click another shelf to move it.`
            : "Click the shelf this is kept on."}
        </p>
        <div className="overflow-x-auto">
          <RackMap
            racks={racks}
            counts={counts}
            highlight={
              value.rackId && value.row !== null && value.col !== null
                ? { rackId: value.rackId, row: value.row, col: value.col }
                : null
            }
            onCellClick={(rackId, row, col) => onChange({ rackId, row, col })}
          />
        </div>
      </div>

      {shelfNote.trim() !== "" && (
        <div className="flex items-center gap-2 text-[12px] text-sage-500">
          <span>
            Also noted: <span className="text-sage-700">{shelfNote}</span>
          </span>
          <button
            type="button"
            onClick={() => onShelfNoteChange("")}
            className="inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-0.5 text-sage-500 hover:bg-cream-200 hover:text-sage-700"
          >
            <X className="h-3 w-3" />
            clear
          </button>
        </div>
      )}
    </div>
  );
}
