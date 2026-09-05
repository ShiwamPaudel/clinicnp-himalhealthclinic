"use client";

/**
 * search-box.tsx — the one search box at the counter.
 *
 * With both modules on it searches medicines and services together, because
 * that is what the person at the desk is doing: a consultation and a strip of
 * paracetamol are one transaction (PRD §4B.4). Results carry a sage Medicine
 * tag or a navy Service tag, and F3 narrows to one kind when the queue is long.
 *
 * With one module on there is nothing to disambiguate, so the tags and the
 * scope hint disappear entirely rather than labelling the only thing there is.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Paperclip, Send, Stethoscope } from "lucide-react";
import type { PosItem, PosService } from "@/lib/pos-types";
import { defaultUnit } from "@/lib/bill-calc";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { cn } from "@/lib/cn";

export interface SearchBoxHandle {
  focus: () => void;
}

export type SearchScope = "all" | "medicine" | "service";

type Result =
  | { kind: "medicine"; item: PosItem; score: number; sortKey: string }
  | { kind: "service"; service: PosService; score: number; sortKey: string };

interface Props {
  items: PosItem[];
  services: PosService[];
  todayIso: string;
  onPick: (item: PosItem) => void;
  onPickService: (service: PosService) => void;
  /** Enter pressed on an empty box — jump to payment. */
  onEmptyEnter: () => void;
}

/**
 * Both kinds are ranked on the same scale so one list can be sorted honestly:
 * a name that starts with what was typed beats one that merely contains it,
 * whichever kind it is. A service's short code is treated as a name — typing
 * "usgap" is how a fast person reaches "USG — Abdomen and Pelvis".
 */
function rank(
  items: PosItem[],
  services: PosService[],
  q: string,
  scope: SearchScope,
): Result[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];

  const out: Result[] = [];

  if (scope !== "service") {
    for (const it of items) {
      const brand = it.brandName.toLowerCase();
      const generic = it.genericName.toLowerCase();
      let score = -1;
      if (brand.startsWith(query)) score = 0;
      else if (generic.startsWith(query)) score = 1;
      else if (brand.includes(query)) score = 2;
      else if (generic.includes(query)) score = 3;
      if (score >= 0) out.push({ kind: "medicine", item: it, score, sortKey: it.brandName });
    }
  }

  if (scope !== "medicine") {
    for (const s of services) {
      const name = s.name.toLowerCase();
      const code = s.code.toLowerCase();
      const group = s.groupName.toLowerCase();
      let score = -1;
      if (code && code.startsWith(query)) score = 0;
      else if (name.startsWith(query)) score = 0;
      else if (name.includes(query)) score = 2;
      else if (group.includes(query)) score = 3;
      if (score >= 0) out.push({ kind: "service", service: s, score, sortKey: s.name });
    }
  }

  return out
    .sort((a, b) => a.score - b.score || a.sortKey.localeCompare(b.sortKey))
    .slice(0, 8);
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

const SCOPE_ORDER: SearchScope[] = ["all", "medicine", "service"];
const SCOPE_LABEL: Record<SearchScope, string> = {
  all: "Everything",
  medicine: "Medicines only",
  service: "Services only",
};

export const SearchBox = forwardRef<SearchBoxHandle, Props>(
  ({ items, services, todayIso, onPick, onPickService, onEmptyEnter }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [scope, setScope] = useState<SearchScope>("all");

    // Both kinds on the counter is what makes the scope switch worth having.
    const bothKinds = items.length > 0 && services.length > 0;
    const effectiveScope = bothKinds ? scope : "all";

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // F3 narrows the search. Bound on the window so it works wherever the
    // person's hands are, exactly like the other counter shortcuts.
    useEffect(() => {
      if (!bothKinds) return;
      function onKey(e: KeyboardEvent) {
        if (e.key !== "F3") return;
        e.preventDefault();
        setScope((s) => SCOPE_ORDER[(SCOPE_ORDER.indexOf(s) + 1) % SCOPE_ORDER.length]!);
        setActive(0);
        inputRef.current?.focus();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [bothKinds]);

    const results = useMemo(
      () => rank(items, services, query, effectiveScope),
      [items, services, query, effectiveScope],
    );

    function pick(r: Result) {
      if (r.kind === "medicine") onPick(r.item);
      else onPickService(r.service);
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
        const r = results[active];
        if (r) pick(r);
      }
    }

    const placeholder = !bothKinds
      ? services.length > 0 && items.length === 0
        ? "Search service — type a name, then Enter"
        : "Search medicine — type a name, then Enter"
      : effectiveScope === "medicine"
        ? "Search medicines — F3 to widen"
        : effectiveScope === "service"
          ? "Search services — F3 to widen"
          : "Search medicine or service — type a name, then Enter";

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
            placeholder={placeholder}
            className="h-14 w-full bg-transparent text-[16px] text-sage-950 placeholder:text-sage-300 focus:outline-none"
            autoFocus
            aria-label={placeholder}
          />
          {bothKinds && effectiveScope !== "all" && (
            <span className="shrink-0 rounded-[999px] bg-sage-150 px-2.5 py-1 text-[12px] text-sage-700">
              {SCOPE_LABEL[effectiveScope]}
            </span>
          )}
        </div>

        {results.length > 0 && (
          <ul className="absolute z-30 mt-1 max-h-[420px] w-full overflow-y-auto rounded-[10px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
            {results.map((r, i) =>
              r.kind === "medicine" ? (
                <MedicineRow
                  key={`m-${r.item.id}`}
                  item={r.item}
                  todayIso={todayIso}
                  showTag={bothKinds}
                  activeRow={i === active}
                  onHover={() => setActive(i)}
                  onClick={() => pick(r)}
                />
              ) : (
                <ServiceRow
                  key={`s-${r.service.id}`}
                  service={r.service}
                  showTag={bothKinds}
                  activeRow={i === active}
                  onHover={() => setActive(i)}
                  onClick={() => pick(r)}
                />
              ),
            )}
          </ul>
        )}
      </div>
    );
  },
);
SearchBox.displayName = "SearchBox";

function MedicineRow({
  item,
  todayIso,
  showTag,
  activeRow,
  onHover,
  onClick,
}: {
  item: PosItem;
  todayIso: string;
  showTag: boolean;
  activeRow: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const u = defaultUnit(item);
  const avail = availableBase(item, todayIso);
  const nearest = nearestExpiry(item, todayIso);
  return (
    <li>
      <button
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
          activeRow ? "bg-sage-150" : "hover:bg-cream-200",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showTag && (
              <span className="shrink-0 rounded-[4px] bg-sage-150 px-1.5 text-[11px] font-medium text-sage-700">
                Medicine
              </span>
            )}
            <span className="truncate text-[15px] font-medium text-sage-900">
              {item.brandName}
            </span>
            {item.controlledFlag && (
              <span className="rounded-[4px] bg-info-100 px-1 text-[11px] text-info-600">
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
          <div className="text-sage-500">{toMixedDisplay(avail, item.units)}</div>
          {nearest && (
            <div className="text-sage-400">
              Exp {formatBS(toBS(adFromIso(nearest)))}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function ServiceRow({
  service,
  showTag,
  activeRow,
  onHover,
  onClick,
}: {
  service: PosService;
  showTag: boolean;
  activeRow: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
          activeRow ? "bg-clinic-75" : "hover:bg-cream-200",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showTag && (
              <span className="shrink-0 rounded-[4px] bg-clinic-150 px-1.5 text-[11px] font-medium text-clinic-700">
                Service
              </span>
            )}
            <span className="truncate text-[15px] font-medium text-sage-900">
              {service.name}
            </span>
          </div>
          <div className="flex items-center gap-2 truncate text-[12px] text-sage-500">
            <span>{service.groupName}</span>
            {service.doctorRequired && (
              <span className="inline-flex items-center gap-0.5" title="Needs a doctor">
                <Stethoscope className="h-3 w-3" />
              </span>
            )}
            {service.outsourced && (
              <span
                className="inline-flex items-center gap-0.5"
                title="Sent to an outside laboratory"
              >
                <Send className="h-3 w-3" />
              </span>
            )}
            {service.keepsFile && (
              <span
                className="inline-flex items-center gap-0.5"
                title="A report comes back for this"
              >
                <Paperclip className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px]">
          <div className="text-[14px] font-medium text-sage-900 tnum">
            {formatPaisa(service.ratePaisa)}
          </div>
          {service.sampleRate && (
            <div className="text-warn-600">sample price</div>
          )}
          {service.followupDays > 0 && (
            <div className="text-sage-400">
              Follow-up {service.followupDays}d
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
