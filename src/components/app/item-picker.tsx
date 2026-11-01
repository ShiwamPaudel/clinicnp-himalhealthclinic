"use client";

/**
 * item-picker.tsx — the medicine box on Opening stock and Purchases.
 *
 * A plain dropdown of a thousand names cannot be used: there is no finding
 * anything in it. This is one box that is both. Click it, or press ↓, and the
 * whole list opens to scroll; type, and the list narrows to what matches, best
 * match first (D-157).
 *
 * A medicine is chosen only from the list — by click, by Enter, or by leaving
 * the box when what was typed matches exactly one. Typing something that
 * matches nothing chosen leaves the box empty and red rather than quietly
 * keeping the medicine that was there before: with rows copied from the row
 * above, "kept the old one" would save the wrong medicine without a word.
 * Esc puts back what was there.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { searchItems } from "@/lib/item-search";
import { cn } from "@/lib/cn";
import type { Item } from "@/lib/repos/items";

/** Rows drawn at once. Past this, typing a few letters is quicker than scrolling. */
const SHOW_AT_MOST = 300;

export interface ItemPickerProps {
  items: Item[];
  /** The chosen item's id, or "" for none. */
  value: string;
  onChange: (itemId: string) => void;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
}

export const ItemPicker = forwardRef<HTMLInputElement, ItemPickerProps>(
  function ItemPicker(
    { items, value, onChange, id, placeholder = "Type to search", "aria-label": ariaLabel },
    ref,
  ) {
    const listId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    useImperativeHandle(ref, () => inputRef.current!);

    /** What has been typed since the box last showed a chosen name, or null. */
    const [query, setQuery] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);
    const results = useMemo(() => searchItems(items, query ?? ""), [items, query]);
    const shown = results.length > SHOW_AT_MOST ? results.slice(0, SHOW_AT_MOST) : results;
    /** Typed text that has not become a medicine. */
    const unresolved = query !== null && query.trim() !== "" && !open && !value;

    // Keep the highlighted row in view while arrowing through the list.
    useEffect(() => {
      if (!open) return;
      listRef.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [active, open]);

    function openList() {
      if (open) return;
      // Start on the chosen medicine when the whole list is showing.
      const at = query === null ? shown.findIndex((r) => r.id === value) : 0;
      setActive(Math.max(0, at));
      setOpen(true);
    }

    function choose(item: Item) {
      if (item.id !== value) onChange(item.id);
      setQuery(null);
      setOpen(false);
    }

    /**
     * Leaving the box. What was typed becomes a medicine only when it can mean
     * one: an exact name, or the only match. Otherwise the box is emptied.
     */
    function settle() {
      setOpen(false);
      if (query === null) return;
      const text = query.trim().toLowerCase();
      if (text === "") {
        if (value) onChange("");
        setQuery(null);
        return;
      }
      const exact = results.filter((r) => r.brandName.toLowerCase() === text);
      const only = exact.length === 1 ? exact[0] : results.length === 1 ? results[0] : undefined;
      if (only) {
        choose(only);
        return;
      }
      if (value) onChange("");
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.min(a + 1, shown.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (open) setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!open) openList();
        else if (shown[active]) choose(shown[active]);
      } else if (e.key === "Escape" && (open || query !== null)) {
        e.preventDefault();
        setOpen(false);
        setQuery(null);
        // Back to the chosen name, selected, ready to be typed over again.
        selectSoon(e.currentTarget);
      }
    }

    const text = query ?? selected?.brandName ?? "";

    return (
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
          aria-invalid={unresolved || undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          title={unresolved ? "Not chosen. Pick a medicine from the list." : undefined}
          value={text}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => {
            // A chosen name is selected whole on every click, so the next key
            // replaces it instead of adding to it. Text being typed is left
            // alone, so a slip can be corrected in place. A frame later,
            // because a click on text already selected collapses the
            // selection after this handler has run.
            if (query === null) selectSoon(e.currentTarget);
            openList();
          }}
          onBlur={settle}
          onKeyDown={onKeyDown}
          className={cn(
            "h-10 w-full rounded-[8px] border bg-cream-50 pl-3 pr-9 text-[14px] text-sage-950",
            "placeholder:text-sage-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700",
            unresolved ? "border-danger-600 text-danger-600" : "border-line",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show all medicines"
          // Keep the cursor in the box, so typing still goes to it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (open) setOpen(false);
            else openList();
          }}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-sage-500 hover:text-sage-900"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div
            // A click on the list, its scrollbar included, must not take the
            // cursor out of the box: that would settle it before the pick lands.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute z-40 mt-1 w-full min-w-[280px] overflow-hidden rounded-[10px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]"
          >
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Medicines"
              className="max-h-[320px] overflow-y-auto py-1"
            >
              {shown.map((item, i) => (
                <li
                  key={item.id}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 px-3 py-2",
                    i === active ? "bg-sage-150" : "hover:bg-cream-200",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-sage-900">
                      <Highlight text={item.brandName} query={query ?? ""} />
                    </div>
                    {(item.genericName || item.manufacturer) && (
                      <div className="truncate text-[12px] text-sage-500">
                        {[item.genericName, item.manufacturer].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  {item.id === value && <Check className="h-4 w-4 shrink-0 text-sage-700" />}
                </li>
              ))}
            </ul>
            {shown.length === 0 && (
              <p className="px-3 py-3 text-[13px] text-sage-500">
                No medicine matches &ldquo;{query?.trim()}&rdquo;.
              </p>
            )}
            {results.length > shown.length && (
              <p className="border-t border-line px-3 py-2 text-[12px] text-sage-500">
                Showing {shown.length} of {results.length}. Keep typing to narrow it down.
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);

/**
 * Select a box's whole text on the next frame, if it still has the cursor and
 * nothing has been typed meanwhile — selecting the first keys of a quick typist
 * would let the next ones overwrite them.
 */
function selectSoon(input: HTMLInputElement) {
  const before = input.value;
  requestAnimationFrame(() => {
    if (document.activeElement === input && input.value === before) input.select();
  });
}

/** The part of a name that matches what was typed, in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-bold text-sage-950">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  );
}
