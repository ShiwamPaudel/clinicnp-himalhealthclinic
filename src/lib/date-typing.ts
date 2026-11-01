/**
 * date-typing.ts — reading a date typed the way a medicine pack prints it.
 *
 * Packs print English dates, and usually only a month: "EXP NOV 29",
 * "EXP 11/2029", "MFD 11.24". Picking that off a calendar is a dozen clicks per
 * line; typing it is five keys. So a date box can take the pack's own wording,
 * and this module turns it into the BS text every date box emits (D-137).
 *
 * A month with no day becomes its first day or its last, and the caller says
 * which: an expiry of "Nov 29" is good until 30 Nov 2029, a manufacture date of
 * "Nov 24" is 1 Nov 2024 (D-156).
 *
 * What is accepted, all read as English (AD) dates:
 *   month and year   Nov 29 · Nov 2029 · November 29 · 11/29 · 11-2029 · 2029-11
 *   a full date      30 Nov 2029 · Nov 30 2029 · 30/11/2029 · 30.11.29 · 2029-11-30
 * Numbers with no month name are day/month/year, as written in Nepal. A two-
 * digit year is 20xx. Anything else is refused with a reason, never guessed.
 */
import { bsToDbText, toBS } from "@/lib/bs";
import { AD_MONTHS_EN, supportedAdRange } from "@/lib/calendar-view";

/** Which day a month with no day becomes. */
export type MonthOnly = "start" | "end";

export type TypedDate =
  | {
      ok: true;
      /** BS text, as every date box emits it. */
      bsText: string;
      /** The same day in AD, at local midnight. */
      ad: Date;
      /** No day was typed, so the first or last day of the month was used. */
      monthOnly: boolean;
    }
  | { ok: false; reason: string };

const MONTHS_LOWER = AD_MONTHS_EN.map((m) => m.toLowerCase());

/** The label a pack prints before the date, which somebody may copy too. */
const LEADING_LABEL = /^(?:exp(?:iry)?|mfg|mfd)\.?\s*(?:date)?\s*[:.]?\s*/;

function fail(reason: string): TypedDate {
  return { ok: false, reason };
}

/** "nov", "novem", "november" and "sept" all name a month; "ju" does not. */
function monthFromName(token: string): number | null {
  if (token.length < 3) return null;
  const i = MONTHS_LOWER.findIndex((m) => m.startsWith(token));
  return i === -1 ? null : i + 1;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** A typed year: two digits are 20xx, four are taken as written. */
function yearOf(token: string): number | null {
  if (token.length === 2) return 2000 + Number(token);
  if (token.length === 4) return Number(token);
  return null;
}

interface Parts {
  year: number;
  month: number;
  /** Absent when only a month was typed. */
  day?: number;
}

/** Turn the tokens into a year, month and maybe a day, or say what is wrong. */
function partsOf(tokens: string[]): Parts | string {
  const isNum = (t: string) => /^\d+$/.test(t);
  const named = tokens.filter((t) => !isNum(t));
  const nums = tokens.filter(isNum);

  if (named.length > 1) return "Type one month only, e.g. Nov 29";
  if (named.length === 1) {
    const month = monthFromName(named[0]!);
    if (month === null) return "Not a month — try Nov 29";
    const at = tokens.indexOf(named[0]!);

    if (nums.length === 1) {
      const n = nums[0]!;
      // "29 Nov" is a day with no year; "Nov 29" is November 2029, as packs
      // print it. Only a four-digit year may come before the month.
      if (at === 1 && n.length !== 4) return "Add the year, e.g. 30 Nov 2029";
      const year = yearOf(n);
      if (year === null) return "Type the year as 29 or 2029";
      return { year, month };
    }
    if (nums.length === 2) {
      // Nov 30 2029 · 30 Nov 2029 · 2029 Nov 30
      const [first, , last] = tokens as [string, string, string];
      let day: string, yearText: string;
      if (at === 0) [day, yearText] = [tokens[1]!, last];
      else if (at === 1 && first.length === 4) [day, yearText] = [last, first];
      else if (at === 1) [day, yearText] = [first, last];
      else return "Try 30 Nov 2029 or Nov 29";
      const year = yearOf(yearText);
      if (year === null) return "Type the year as 29 or 2029";
      if (day.length > 2) return "Try 30 Nov 2029 or Nov 29";
      return { year, month, day: Number(day) };
    }
    return "Try Nov 29 or 30 Nov 2029";
  }

  // Numbers only.
  if (nums.length === 2) {
    const [a, b] = nums as [string, string];
    // 2029-11, or 11/29 and 11/2029.
    if (a.length === 4 && b.length <= 2) return { year: Number(a), month: Number(b) };
    if (a.length > 2) return "Try 11/29 or 11/2029";
    const year = yearOf(b);
    if (year === null) return "Type the year as 29 or 2029";
    return { year, month: Number(a) };
  }
  if (nums.length === 3) {
    const [a, b, c] = nums as [string, string, string];
    // 2029-11-30, else day/month/year.
    if (a.length === 4) {
      if (b.length > 2 || c.length > 2) return "Try 30/11/2029";
      return { year: Number(a), month: Number(b), day: Number(c) };
    }
    if (a.length > 2 || b.length > 2) return "Try 30/11/2029";
    const year = yearOf(c);
    if (year === null) return "Type the year as 29 or 2029";
    return { year, month: Number(b), day: Number(a) };
  }
  if (nums.length === 1) return "Add the month, e.g. Nov 29 or 11/29";
  return "Try Nov 29 or 30/11/2029";
}

/**
 * Read what was typed into a date box. `monthOnly` says which day a month with
 * no day becomes: the first for a manufacture date, the last for an expiry.
 */
export function parseTypedDate(text: string, monthOnly: MonthOnly): TypedDate {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(LEADING_LABEL, "")
    // "nov29" and "30nov2029" are written without spaces on many packs.
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2");
  const tokens = cleaned.split(/[\s/\-.,'’]+/).filter(Boolean);
  if (tokens.length === 0) return fail("Type a date, e.g. Nov 29");
  if (tokens.some((t) => !/^(?:\d+|[a-z]+)$/.test(t))) {
    return fail("Try Nov 29 or 30/11/2029");
  }

  const parts = partsOf(tokens);
  if (typeof parts === "string") return fail(parts);

  const { year, month } = parts;
  // The calendar covers AD dates up to about March 2034, so a year in the
  // eighties is a Nepali year typed by habit, not a far-off expiry.
  if (year >= 2035 && year <= 2100) {
    return fail(`${year} is a Nepali year — type the English date`);
  }
  if (month < 1 || month > 12) return fail("The month must be 1 to 12");
  const last = daysInMonth(year, month);
  if (parts.day !== undefined && (parts.day < 1 || parts.day > last)) {
    return fail(`${AD_MONTHS_EN[month - 1]} ${year} has ${last} days`);
  }

  const day = parts.day ?? (monthOnly === "start" ? 1 : last);
  const ad = new Date(year, month - 1, day);
  const { firstAd, lastAd } = supportedAdRange();
  if (ad < firstAd || ad > lastAd) {
    return fail("That date is outside the calendar");
  }
  return {
    ok: true,
    bsText: bsToDbText(toBS(ad)),
    ad,
    monthOnly: parts.day === undefined,
  };
}
