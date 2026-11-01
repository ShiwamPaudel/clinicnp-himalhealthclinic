"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
} from "lucide-react";
import {
  canStep,
  formatInCalendar,
  monthGrid,
  parseBsValue,
  stepView,
  switchCalendar,
  todayBsText,
  viewContaining,
  type DateCalendar,
  type MonthView,
} from "@/lib/calendar-view";
import { parseTypedDate, type MonthOnly } from "@/lib/date-typing";
import { useDateCalendar } from "@/components/ui/date-calendar-context";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat

/** The popup's width, and the gap it keeps from the edge of the screen. */
const POPUP_WIDTH = 288;
const EDGE_GAP = 8;

export interface DatePickerBSProps {
  /** Selected date as denormalized BS text "YYYY-MM-DD", or empty. */
  value?: string;
  onChange: (bsText: string) => void;
  id?: string;
  placeholder?: string;
  /** Offer "Clear", for a date that may be left empty. Emits "". */
  clearable?: boolean;
  /**
   * Let the date be typed as well as picked, the way a pack prints it: "Nov 29",
   * "11/2029", "30/11/2029" (D-156). A month with no day becomes its first day
   * ("start", for a manufacture date) or its last ("end", for an expiry).
   * Without it the box is a button that opens the calendar, as before.
   */
  typeMonthAs?: MonthOnly;
}

/**
 * The date box. Takes and emits BS text ("2083-04-01") whichever calendar it
 * shows, so nothing behind it changes (D-137).
 *
 * It opens in the shop's calendar from Settings → Company and writes the
 * chosen date in that calendar too. The Nepali / English switch inside flips
 * the grid for this one pick, then the next open starts from the setting
 * again.
 */
export function DatePickerBS({
  value,
  onChange,
  id,
  placeholder = "Select date",
  clearable = false,
  typeMonthAs,
}: DatePickerBSProps) {
  const shopCalendar = useDateCalendar();
  const selected = parseBsValue(value) ? value! : "";

  const [open, setOpen] = useState(false);
  /** How far left the popup moves so it stays on a narrow screen. */
  const [shift, setShift] = useState(0);
  const [view, setView] = useState<MonthView>(() =>
    viewContaining(shopCalendar, selected),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteId = useId();

  /** What is being typed, or null while the box shows the chosen date. */
  const [draft, setDraft] = useState<string | null>(null);
  /** Why the last thing typed was not taken. Cleared by the next key. */
  const [typeError, setTypeError] = useState("");
  const typed =
    typeMonthAs && draft !== null && draft.trim() !== ""
      ? parseTypedDate(draft, typeMonthAs)
      : null;

  // Close on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        (typeMonthAs ? inputRef : buttonRef).current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, typeMonthAs]);

  function toggleOpen() {
    if (!open) {
      // Every open starts from the shop's calendar, on the chosen date's month.
      setView(viewContaining(shopCalendar, selected));
      // A box near the right of a phone screen would push the popup off it.
      const rect = rootRef.current?.getBoundingClientRect();
      const over = rect ? rect.left + POPUP_WIDTH - (window.innerWidth - EDGE_GAP) : 0;
      setShift(rect && over > 0 ? -Math.min(over, Math.max(0, rect.left - EDGE_GAP)) : 0);
    }
    setOpen((o) => !o);
  }

  function showCalendar(calendar: DateCalendar) {
    if (calendar !== view.calendar) setView(switchCalendar(view, selected));
  }

  function pick(bsText: string) {
    onChange(bsText);
    setOpen(false);
    if (typeMonthAs) {
      setDraft(null);
      setTypeError("");
      inputRef.current?.focus();
    }
  }

  /**
   * Take what was typed, on Enter or on leaving the box. Something that cannot
   * be read is never half-taken: the box goes back to the date it had, and
   * says why underneath, so what it shows is always what will be saved.
   */
  function commitDraft() {
    if (draft === null || !typeMonthAs) return;
    const text = draft.trim();
    setDraft(null);
    if (text === "") {
      // Emptying the box clears a date that may be empty; one that is required
      // keeps what it had.
      if (clearable && selected) onChange("");
      return;
    }
    const result = parseTypedDate(text, typeMonthAs);
    if (!result.ok) {
      setTypeError(result.reason);
      return;
    }
    setTypeError("");
    if (result.bsText !== selected) onChange(result.bsText);
  }

  const grid = monthGrid(view);
  const todayText = todayBsText();
  const label = selected ? formatInCalendar(selected, shopCalendar) : placeholder;

  /** Under a typed box: what is about to be taken, or why it was not. */
  const note = typed?.ok
    ? `${formatInCalendar(typed.bsText, "ad")} · ${formatInCalendar(typed.bsText, "bs")}`
    : typeError;

  return (
    <div ref={rootRef} className="relative">
      {typeMonthAs ? (
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={draft ?? (selected ? label : "")}
            aria-invalid={typeError ? true : undefined}
            aria-describedby={note ? noteId : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => {
              // The date shown is selected whole on every click, so typing
              // replaces it; text being typed is left alone to be corrected.
              // A frame later, because a click on text already selected
              // collapses the selection after this handler has run — and only
              // if nothing was typed in that frame, or it would be overwritten.
              if (draft !== null) return;
              const input = e.currentTarget;
              const before = input.value;
              requestAnimationFrame(() => {
                if (document.activeElement === input && input.value === before) input.select();
              });
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              setTypeError("");
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
                setOpen(false);
              } else if (e.key === "Escape" && draft !== null) {
                e.preventDefault();
                setDraft(null);
                setTypeError("");
              } else if (e.key === "ArrowDown" && e.altKey && !open) {
                e.preventDefault();
                toggleOpen();
              }
            }}
            className={cn(
              "h-10 w-full rounded-[8px] border bg-cream-50 pl-3 pr-9 text-[14px] text-sage-950",
              "placeholder:text-sage-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700",
              typeError ? "border-danger-600" : "border-line",
            )}
          />
          <button
            ref={buttonRef}
            type="button"
            tabIndex={-1}
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label="Open the calendar"
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-sage-500 hover:text-sage-900"
          >
            <Calendar className="h-4 w-4" />
          </button>
          {note && (
            // Floats in the gap below the box, so it never pushes the boxes
            // beside it out of line.
            <p
              id={noteId}
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute left-0 top-full mt-1 whitespace-nowrap text-[12px]",
                typeError ? "font-medium text-danger-600" : "text-sage-600",
              )}
            >
              {note}
            </p>
          )}
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          id={id}
          onClick={toggleOpen}
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-[8px] border border-line bg-cream-50 px-3 text-left text-[14px]",
            selected ? "text-sage-950" : "text-sage-300",
          )}
        >
          <span className="truncate">{label}</span>
          <Calendar className="h-4 w-4 shrink-0 text-sage-500" />
        </button>
      )}

      {open && (
        <div
          style={{ width: POPUP_WIDTH, left: shift }}
          className="absolute z-50 mt-1 rounded-[10px] border border-line bg-cream-50 p-3 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Calendar"
              className="inline-flex rounded-[999px] border border-line bg-cream-100 p-0.5"
            >
              <CalendarChip
                active={view.calendar === "bs"}
                onClick={() => showCalendar("bs")}
              >
                <span lang="ne" className="deva">
                  नेपाली
                </span>
              </CalendarChip>
              <CalendarChip
                active={view.calendar === "ad"}
                onClick={() => showCalendar("ad")}
              >
                English
              </CalendarChip>
            </div>
            {clearable && selected && (
              <button
                type="button"
                onClick={() => pick("")}
                className="rounded-[8px] px-2 py-1 text-[12px] text-sage-500 hover:bg-cream-200 hover:text-sage-900"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className="flex">
              <StepButton
                onClick={() => setView(stepView(view, -12))}
                disabled={!canStep(view, -12)}
                label="Previous year"
              >
                <ChevronsLeft className="h-4 w-4" />
              </StepButton>
              <StepButton
                onClick={() => setView(stepView(view, -1))}
                disabled={!canStep(view, -1)}
                label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </StepButton>
            </div>
            <div className="min-w-0 text-center" aria-live="polite">
              <div
                className={cn(
                  "text-[15px] font-semibold text-sage-900",
                  grid.titleScript === "np" && "deva",
                )}
              >
                {grid.title}
              </div>
              <div className="text-[11px] text-sage-500">{grid.subtitle}</div>
            </div>
            <div className="flex">
              <StepButton
                onClick={() => setView(stepView(view, 1))}
                disabled={!canStep(view, 1)}
                label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </StepButton>
              <StepButton
                onClick={() => setView(stepView(view, 12))}
                disabled={!canStep(view, 12)}
                label="Next year"
              >
                <ChevronsRight className="h-4 w-4" />
              </StepButton>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className={cn(
                  "py-1 text-[11px] font-semibold",
                  i === 6 ? "text-danger-600" : "text-sage-500",
                )}
              >
                {w}
              </div>
            ))}
            {Array.from({ length: grid.leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {grid.days.map((d) => {
              const isSelected = !d.disabled && d.bsText === selected;
              const isToday = !d.disabled && d.bsText === todayText;
              return (
                <button
                  key={d.day}
                  type="button"
                  disabled={d.disabled}
                  onClick={() => pick(d.bsText)}
                  aria-label={d.label}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-[8px] text-[13px] tnum",
                    d.disabled
                      ? "cursor-not-allowed text-sage-300"
                      : isSelected
                        ? "bg-sage-700 text-cream-50"
                        : "hover:bg-cream-200",
                    !d.disabled && !isSelected && d.weekday === 6 && "text-danger-600",
                    !d.disabled && !isSelected && isToday && "ring-1 ring-sage-500",
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-2 border-t border-line pt-2 text-[11px] text-sage-500">
              {formatInCalendar(selected, "bs")} = {formatInCalendar(selected, "ad")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[999px] px-2.5 py-0.5 text-[12px] transition-colors",
        active
          ? "bg-sage-700 text-cream-50"
          : "text-sage-600 hover:text-sage-900",
      )}
    >
      {children}
    </button>
  );
}

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-[8px] p-1 hover:bg-cream-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
