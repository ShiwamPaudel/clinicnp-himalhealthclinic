"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search } from "lucide-react";
import type { PosItem } from "@/lib/pos-types";
import { defaultUnit } from "@/lib/bill-calc";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { cn } from "@/lib/cn";

export interface SearchBoxHandle {
  focus: () => void;
}

interface Props {
  items: PosItem[];
  todayIso: string;
  onPick: (item: PosItem) => void;
  /** Enter pressed on an empty box — jump to payment. */
  onEmptyEnter: () => void;
}

function rank(items: PosItem[], q: string): PosItem[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const scored = items
    .map((it) => {
      const brand = it.brandName.toLowerCase();
      const generic = it.genericName.toLowerCase();
      let score = -1;
      if (brand.startsWith(query)) score = 0;
      else if (generic.startsWith(query)) score = 1;
      else if (brand.includes(query)) score = 2;
      else if (generic.includes(query)) score = 3;
      return { it, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.it.brandName.localeCompare(b.it.brandName));
  return scored.slice(0, 8).map((x) => x.it);
}

function availableBase(item: PosItem, todayIso: string): number {
  return item.batches
    .filter((b) => b.expiryDateAd >= todayIso)
    .reduce((s, b) => s + b.remainingBaseQty, 0);
}

function nearestExpiry(item: PosItem, todayIso: string): string | null {
  const live = item.batches
    .filter((b) => b.expiryDateAd >= todayIso && b.remainingBaseQty > 0)
    .sort((a, b) => (a.expiryDateAd < b.expiryDateAd ? -1 : 1));
  return live[0]?.expiryDateAd ?? null;
}

export const SearchBox = forwardRef<SearchBoxHandle, Props>(
  ({ items, todayIso, onPick, onEmptyEnter }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const results = useMemo(() => rank(items, query), [items, query]);

    function pick(item: PosItem) {
      onPick(item);
      setQuery("");
      setActive(0);
    }

    function onKeyDown(e: React.KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (query.trim() === "") {
          onEmptyEnter();
          return;
        }
        const item = results[active];
        if (item) pick(item);
      }
    }

    return (
      <div className="relative">
        <div className="flex items-center gap-2 rounded-[10px] border border-line bg-cream-50 px-4">
          <Search className="h-5 w-5 text-sage-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search medicine — type a name, then Enter"
            className="h-14 w-full bg-transparent text-[16px] text-sage-950 placeholder:text-sage-300 focus:outline-none"
            autoFocus
            aria-label="Search medicine"
          />
        </div>

        {results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-[420px] w-full overflow-y-auto rounded-[10px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
            {results.map((item, i) => {
              const u = defaultUnit(item);
              const avail = availableBase(item, todayIso);
              const nearest = nearestExpiry(item, todayIso);
              return (
                <li key={item.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
                      i === active ? "bg-sage-150" : "hover:bg-cream-200",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-medium text-sage-900">
                        {item.brandName}
                        {item.controlledFlag && (
                          <span className="ml-2 rounded-[4px] bg-info-100 px-1 text-[11px] text-info-600">
                            Rx
                          </span>
                        )}
                      </div>
                      {item.genericName && (
                        <div className="truncate text-[12px] text-sage-500">
                          {item.genericName}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[12px]">
                      <div className="text-[14px] font-medium text-sage-900 tnum">
                        {formatPaisa(u.sellingRatePaisa)} / {u.name}
                      </div>
                      <div className="text-sage-500">
                        {toMixedDisplay(avail, item.units)}
                      </div>
                      {nearest && (
                        <div className="text-sage-400">
                          Exp {formatBS(toBS(adFromIso(nearest)))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  },
);
SearchBox.displayName = "SearchBox";
