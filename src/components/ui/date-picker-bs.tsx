"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  BS_MONTHS_EN,
  BS_MONTHS_NP,
  bsDayOfWeek,
  bsMonthRange,
  bsToDbText,
  formatBS,
  toAD,
  today,
  type BSDate,
} from "@/lib/bs";
import { adToIso } from "@/lib/bs";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat

export interface DatePickerBSProps {
  /** Selected date as denormalized BS text "YYYY-MM-DD", or empty. */
  value?: string;
  onChange: (bsText: string) => void;
  id?: string;
  placeholder?: string;
}

/** BS date picker. Emits the denormalized BS text ("2083-04-01"). */
export function DatePickerBS({
  value,
  onChange,
  id,
  placeholder = "Select date",
}: DatePickerBSProps) {
  const selected = useMemo<BSDate | null>(() => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m, day: d };
  }, [value]);

  const now = today();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ year: number; month: number }>(
    selected ?? { year: now.year, month: now.month },
  );

  const daysInMonth = bsMonthRange(view.year, view.month).endBs.day;
  const firstDow = bsDayOfWeek({ year: view.year, month: view.month, day: 1 });

  function step(delta: number) {
    let m = view.month + delta;
    let y = view.year;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setView({ year: y, month: m });
  }

  function pick(day: number) {
    const bs: BSDate = { year: view.year, month: view.month, day };
    onChange(bsToDbText(bs));
    setOpen(false);
  }

  const label = selected
    ? formatBS(selected, { form: "long", monthScript: "en" })
    : placeholder;

  const viewAd = adToIso(toAD({ year: view.year, month: view.month, day: 1 }));

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-[8px] border border-line bg-cream-50 px-3 text-left text-[14px]",
          selected ? "text-sage-950" : "text-sage-300",
        )}
      >
        <span>{label}</span>
        <Calendar className="h-4 w-4 text-sage-500" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[280px] rounded-[10px] border border-line bg-cream-50 p-3 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded-[8px] p-1 hover:bg-cream-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <div className="deva text-[15px] font-semibold text-sage-900">
                {BS_MONTHS_NP[view.month - 1]} {view.year}
              </div>
              <div className="text-[11px] text-sage-500">
                {BS_MONTHS_EN[view.month - 1]} · {viewAd}
              </div>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded-[8px] p-1 hover:bg-cream-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
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
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dow = (firstDow + i) % 7;
              const isSelected =
                selected?.year === view.year &&
                selected?.month === view.month &&
                selected?.day === day;
              const isToday =
                now.year === view.year &&
                now.month === view.month &&
                now.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-[8px] text-[13px] tnum",
                    isSelected
                      ? "bg-sage-700 text-cream-50"
                      : "hover:bg-cream-200",
                    !isSelected && dow === 6 && "text-danger-600",
                    !isSelected && isToday && "ring-1 ring-sage-500",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-2 border-t border-line pt-2 text-[11px] text-sage-500">
              AD: {adToIso(toAD(selected))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
