/**
 * sms-schedule.ts — which day a monthly reminder goes out on.
 *
 * Pure apart from the calendar, which comes from `lib/bs.ts` like every other
 * BS date in the app (Rules §1.5). Shared by the form, which shows the next
 * few dates before anything is saved, and the morning run, which moves a
 * reminder on once its message has gone.
 *
 * A reminder goes out once a day, in the morning: one scheduled run at 6:00
 * Nepal time sends everything due that day (owner's choice, C-028).
 */
import {
  bsDaysInMonth,
  bsFromDbText,
  bsToDbText,
  toAD,
  adToIso,
  adFromIso,
  formatBS,
  todayInNepal,
  type BSDate,
} from "@/lib/bs";

/**
 * The day in a given month for a reminder set on `dayOfMonth`. A month too
 * short for it gets its last day: the 32nd is the 30th in a 30-day month.
 */
export function occurrenceIn(
  year: number,
  month: number,
  dayOfMonth: number,
): BSDate {
  return { year, month, day: Math.min(dayOfMonth, bsDaysInMonth(year, month)) };
}

/** The same day in the month after `current`'s, going back to `dayOfMonth`. */
export function nextOccurrence(current: BSDate, dayOfMonth: number): BSDate {
  const month = current.month === 12 ? 1 : current.month + 1;
  const year = current.month === 12 ? current.year + 1 : current.year;
  return occurrenceIn(year, month, dayOfMonth);
}

/** The next `count` dates a reminder will go out, starting with `first`. */
export function upcomingDates(first: BSDate, dayOfMonth: number, count: number): BSDate[] {
  const out: BSDate[] = [first];
  while (out.length < count) out.push(nextOccurrence(out[out.length - 1]!, dayOfMonth));
  return out;
}

/** A BS date as the AD text it is stored and compared by. */
export function bsTextToAdIso(bsText: string): string {
  return adToIso(toAD(bsFromDbText(bsText)));
}

/** `iso` plus `days` (which may be negative), as AD text. */
export function addDaysIso(iso: string, days: number): string {
  const d = adFromIso(iso);
  d.setDate(d.getDate() + days);
  return adToIso(d);
}

/**
 * What the morning run should do with a reminder whose next date is
 * `nextAd`, on `todayAd` (both AD text, Nepal's date):
 *
 *  - `later`  — not yet.
 *  - `due`    — today, or yesterday. Yesterday counts so that a morning when
 *               the run did not happen, or the message could not go, is made
 *               up for the next morning rather than lost.
 *  - `missed` — older than that. A month's reminder arriving days late is
 *               worse than none, so it is written down as missed and the
 *               reminder moves on to its next month.
 */
export type DueState = "later" | "due" | "missed";

export function dueState(nextAd: string, todayAd: string): DueState {
  if (nextAd > todayAd) return "later";
  if (nextAd >= addDaysIso(todayAd, -1)) return "due";
  return "missed";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 32nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Every month on the 10th". */
export function describeSchedule(dayOfMonth: number): string {
  return `Every month on the ${ordinal(dayOfMonth)}`;
}

/** "10 Poush 2083" — how a reminder's date is written on screen and in a message. */
export function longBs(bsText: string): string {
  return formatBS(bsFromDbText(bsText), { form: "long", monthScript: "en" });
}

/**
 * When something happened, as a clock in Nepal reads it: "10 Poush 2083,
 * 7:02 AM". Stored times are UTC, and the server runs on UTC too.
 */
export function nepalWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const shifted = new Date(at.getTime() + (5 * 60 + 45) * 60_000);
  const h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${formatBS(todayInNepal(at), { form: "long", monthScript: "en" })}, ${clock}`;
}

/** Text form of a BSDate, re-exported so callers need one import. */
export function bsText(bs: BSDate): string {
  return bsToDbText(bs);
}
