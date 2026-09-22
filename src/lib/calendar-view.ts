/**
 * calendar-view.ts — the arithmetic behind the date picker's two faces.
 *
 * Every date box in ClinicNP takes and gives BS text ("2083-06-06"), and
 * everything behind the box — the server, the database, the printed bill —
 * keeps working in BS exactly as before. What changes is only the calendar a
 * person picks from: the Nepali month grid, or the English one. A medicine
 * pack prints "EXP 06/2027" in English dates; nobody should have to convert
 * that in their head to find it on a Nepali grid (D-137).
 *
 * This module lays out either grid and turns a pick back into BS text, so the
 * picker component holds no date maths of its own and this can be tested.
 */
import {
  BS_MONTHS_EN,
  BS_MONTHS_NP,
  adToIso,
  bsDayOfWeek,
  bsFromDbText,
  bsMonthRange,
  bsToDbText,
  formatBS,
  toAD,
  toBS,
  today,
  type BSDate,
} from "@/lib/bs";

/** Which calendar a date box shows: Nepali (BS) or English (AD). */
export type DateCalendar = "bs" | "ad";

export const DEFAULT_DATE_CALENDAR: DateCalendar = "bs";

export function isDateCalendar(v: unknown): v is DateCalendar {
  return v === "bs" || v === "ad";
}

export const AD_MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const AD_MONTHS_SHORT = AD_MONTHS_EN.map((m) => m.slice(0, 3));

/** One month on screen. `month` is 1-12 in whichever calendar it belongs to. */
export interface MonthView {
  calendar: DateCalendar;
  year: number;
  month: number;
}

// ---------------------------------------------------------------------------
// The range the converter can handle
//
// The BS converter covers 2000/01/01 to 2090/12/30 — roughly April 1943 to
// April 2034. The last BS month cannot be laid out, because a month's length
// is found from the first day of the month after it, so the picker stops at
// the end of 2090/11 (about March 2034). No expiry date comes close.
// ---------------------------------------------------------------------------

const BS_FIRST_MONTH = { year: 2000, month: 1 };
const BS_LAST_MONTH = { year: 2090, month: 11 };

let limits: { firstAd: Date; lastAd: Date } | null = null;

/** First and last day a date box will offer, as AD dates at local midnight. */
export function supportedAdRange(): { firstAd: Date; lastAd: Date } {
  limits ??= {
    firstAd: toAD({ year: BS_FIRST_MONTH.year, month: BS_FIRST_MONTH.month, day: 1 }),
    lastAd: bsMonthRange(BS_LAST_MONTH.year, BS_LAST_MONTH.month).endAd,
  };
  return limits;
}

function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function fromIndex(i: number): { year: number; month: number } {
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

function viewBounds(calendar: DateCalendar): { min: number; max: number } {
  if (calendar === "bs") {
    return {
      min: monthIndex(BS_FIRST_MONTH.year, BS_FIRST_MONTH.month),
      max: monthIndex(BS_LAST_MONTH.year, BS_LAST_MONTH.month),
    };
  }
  const { firstAd, lastAd } = supportedAdRange();
  return {
    min: monthIndex(firstAd.getFullYear(), firstAd.getMonth() + 1),
    max: monthIndex(lastAd.getFullYear(), lastAd.getMonth() + 1),
  };
}

/** Keep a view inside the months the converter can lay out. */
export function clampView(view: MonthView): MonthView {
  const { min, max } = viewBounds(view.calendar);
  const i = Math.min(max, Math.max(min, monthIndex(view.year, view.month)));
  return { calendar: view.calendar, ...fromIndex(i) };
}

/** Move by whole months (12 = one year), never past the supported range. */
export function stepView(view: MonthView, months: number): MonthView {
  return clampView({
    calendar: view.calendar,
    ...fromIndex(monthIndex(view.year, view.month) + months),
  });
}

export function canStep(view: MonthView, months: number): boolean {
  const { min, max } = viewBounds(view.calendar);
  const i = monthIndex(view.year, view.month) + months;
  return i >= min && i <= max;
}

/** A BS text value that is well-formed and inside the supported range. */
export function parseBsValue(value: string | null | undefined): BSDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const bs = bsFromDbText(value);
  if (bs.month < 1 || bs.month > 12 || bs.day < 1 || bs.day > 32) return null;
  try {
    toAD(bs);
    return bs;
  } catch {
    return null;
  }
}

/**
 * The month to open on: the one holding the chosen date, or this month when
 * nothing is chosen yet.
 */
export function viewContaining(
  calendar: DateCalendar,
  value: string | null | undefined,
): MonthView {
  const bs = parseBsValue(value) ?? today();
  if (calendar === "bs") {
    return clampView({ calendar, year: bs.year, month: bs.month });
  }
  const ad = toAD(bs);
  return clampView({ calendar, year: ad.getFullYear(), month: ad.getMonth() + 1 });
}

/** The first day of a view, as BS text. */
function firstDayOf(view: MonthView): string {
  if (view.calendar === "bs") {
    return bsToDbText({ year: view.year, month: view.month, day: 1 });
  }
  const { firstAd } = supportedAdRange();
  const first = new Date(view.year, view.month - 1, 1);
  return bsToDbText(toBS(first < firstAd ? firstAd : first));
}

/**
 * Flip to the other calendar without losing your place: land on the month
 * holding the chosen date, or else the month you were looking at.
 */
export function switchCalendar(
  view: MonthView,
  value: string | null | undefined,
): MonthView {
  const other: DateCalendar = view.calendar === "bs" ? "ad" : "bs";
  const anchor = parseBsValue(value) ? value! : firstDayOf(view);
  return viewContaining(other, anchor);
}

export interface GridDay {
  day: number;
  /** What picking this day emits. Empty for a day outside the supported range. */
  bsText: string;
  /** 0 = Sunday … 6 = Saturday, the Nepali weekend. */
  weekday: number;
  disabled: boolean;
  /** Read out by a screen reader: "22 September 2026". */
  label: string;
}

export interface MonthGrid {
  /** Empty cells before the 1st, so it sits under its weekday. */
  leadingBlanks: number;
  days: GridDay[];
  title: string;
  /** Nepali month names are set in Devanagari. */
  titleScript: "np" | "en";
  subtitle: string;
}

/** Lay out one month of either calendar. */
export function monthGrid(input: MonthView): MonthGrid {
  const view = clampView(input);
  return view.calendar === "bs" ? bsGrid(view) : adGrid(view);
}

function bsGrid(view: MonthView): MonthGrid {
  const { startAd, endBs } = bsMonthRange(view.year, view.month);
  const firstDow = bsDayOfWeek({ year: view.year, month: view.month, day: 1 });
  const days: GridDay[] = [];
  for (let d = 1; d <= endBs.day; d++) {
    const bs: BSDate = { year: view.year, month: view.month, day: d };
    days.push({
      day: d,
      bsText: bsToDbText(bs),
      weekday: (firstDow + d - 1) % 7,
      disabled: false,
      label: formatBS(bs, { form: "long", monthScript: "en" }),
    });
  }
  return {
    leadingBlanks: firstDow,
    days,
    title: `${BS_MONTHS_NP[view.month - 1]} ${view.year}`,
    titleScript: "np",
    // Unchanged from the picker people already know: the month's English
    // spelling and the English date its 1st falls on.
    subtitle: `${BS_MONTHS_EN[view.month - 1]} · ${adToIso(startAd)}`,
  };
}

function adGrid(view: MonthView): MonthGrid {
  const { firstAd, lastAd } = supportedAdRange();
  const count = new Date(view.year, view.month, 0).getDate();
  const firstDow = new Date(view.year, view.month - 1, 1).getDay();
  const days: GridDay[] = [];
  let firstBs: BSDate | null = null;
  let lastBs: BSDate | null = null;
  for (let d = 1; d <= count; d++) {
    const ad = new Date(view.year, view.month - 1, d);
    const disabled = ad < firstAd || ad > lastAd;
    const bs = disabled ? null : toBS(ad);
    if (bs) {
      firstBs ??= bs;
      lastBs = bs;
    }
    days.push({
      day: d,
      bsText: bs ? bsToDbText(bs) : "",
      weekday: (firstDow + d - 1) % 7,
      disabled,
      label: `${d} ${AD_MONTHS_EN[view.month - 1]} ${view.year}`,
    });
  }
  return {
    leadingBlanks: firstDow,
    days,
    title: `${AD_MONTHS_EN[view.month - 1]} ${view.year}`,
    titleScript: "en",
    subtitle: firstBs && lastBs ? bsSpan(firstBs, lastBs) : "",
  };
}

/** "Bhadra – Ashwin 2083", or across a new year "Chaitra 2082 – Baishakh 2083". */
function bsSpan(a: BSDate, b: BSDate): string {
  const name = (bs: BSDate) => BS_MONTHS_EN[bs.month - 1];
  if (a.year === b.year && a.month === b.month) return `${name(a)} ${a.year}`;
  if (a.year === b.year) return `${name(a)} – ${name(b)} ${b.year}`;
  return `${name(a)} ${a.year} – ${name(b)} ${b.year}`;
}

/** A BS text value written out in one calendar: "6 Ashwin 2083" or "22 Sep 2026". */
export function formatInCalendar(value: string, calendar: DateCalendar): string {
  const bs = parseBsValue(value);
  if (!bs) return "";
  if (calendar === "bs") return formatBS(bs, { form: "long", monthScript: "en" });
  const ad = toAD(bs);
  return `${ad.getDate()} ${AD_MONTHS_SHORT[ad.getMonth()]} ${ad.getFullYear()}`;
}

/** Today as BS text, for marking today on either grid. */
export function todayBsText(): string {
  return bsToDbText(today());
}
