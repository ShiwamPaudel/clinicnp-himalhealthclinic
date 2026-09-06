"use client";

/**
 * shelf-inspector.tsx — click a shelf, see what is on it, put things on it.
 *
 * The item form places one medicine. This places many, and that is the
 * difference between a feature and a feature somebody actually uses: a shop
 * opening with two hundred items will not visit two hundred edit screens.
 * Both write the same three columns through the same check.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { setItemCellAction } from "@/app/(app)/settings/rack-actions";
import type { Rack, ShelfRow } from "@/lib/repos/racks";

export interface SelectedCell {
  rackId: string;
  row: number;
  col: number;
}

export function ShelfInspector({
  rack,
  cell,
  items,
  onClose,
}: {
  rack: Rack;
  cell: SelectedCell;
  items: ShelfRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const here = useMemo(
    () =>
      items.filter(
        (i) =>
          i.rackId === cell.rackId &&
          i.row === cell.row &&
          i.col === cell.col,
      ),
    [items, cell],
  );

  // Anything not already on this shelf is a candidate, including things resting
  // on another one: moving a medicine is the same gesture as placing it.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    return items
      .filter(
        (i) =>
          !(
            i.rackId === cell.rackId &&
            i.row === cell.row &&
            i.col === cell.col
          ) &&
          (i.brandName.toLowerCase().includes(q) ||
            i.genericName.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [items, query, cell]);

  async function place(itemId: string) {
    setBusy(itemId);
    const res = await setItemCellAction({
      itemId,
      rackId: cell.rackId,
      row: cell.row,
      col: cell.col,
    });
    setBusy(null);
    if (res.ok) {
      setQuery("");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  async function takeOff(itemId: string) {
    setBusy(itemId);
    const res = await setItemCellAction({
      itemId,
      rackId: null,
      row: null,
      col: null,
    });
    setBusy(null);
    if (res.ok) router.refresh();
    else toast.error(res.userMessage ?? "Something went wrong.");
  }

  return (
    <div className="rounded-[10px] border border-magenta-600 bg-cream-50 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-sage-900">
            {rack.name} · R{cell.row}C{cell.col}
          </h3>
          <p className="text-[13px] text-sage-500">
            {here.length === 0
              ? "Nothing on this shelf yet."
              : `${here.length} item${here.length === 1 ? "" : "s"} on this shelf.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the shelf"
          className="rounded-[8px] p-1.5 text-sage-500 hover:bg-cream-200 hover:text-sage-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {here.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {here.map((i) => (
            <li
              key={i.itemId}
              className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-100 px-3 py-2"
            >
              <Link
                href={`/items/${i.itemId}`}
                className="min-w-0 flex-1 truncate text-[14px] text-sage-900 hover:underline"
              >
                {i.brandName}
                {i.genericName && (
                  <span className="text-sage-500"> · {i.genericName}</span>
                )}
              </Link>
              <button
                type="button"
                disabled={busy === i.itemId}
                onClick={() => void takeOff(i.itemId)}
                className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] text-sage-500 hover:bg-cream-200 hover:text-danger-600 disabled:opacity-50"
              >
                take off
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <div className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-3">
          <Search className="h-4 w-4 shrink-0 text-sage-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Put something here — type a medicine name"
            aria-label={`Put an item on ${rack.name} row ${cell.row} column ${cell.col}`}
            className="border-0 px-0 focus-visible:ring-0"
          />
        </div>
        {matches.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-[8px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
            {matches.map((i) => (
              <li key={i.itemId}>
                <button
                  type="button"
                  disabled={busy === i.itemId}
                  onClick={() => void place(i.itemId)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream-200 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-sage-500" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-sage-900">
                    {i.brandName}
                    {i.genericName && (
                      <span className="text-sage-500"> · {i.genericName}</span>
                    )}
                  </span>
                  {i.rackId && (
                    <span className="shrink-0 text-[11px] text-warn-600">
                      moving from {i.rackName} R{i.row}C{i.col}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
