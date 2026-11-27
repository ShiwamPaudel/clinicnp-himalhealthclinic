/**
 * web-booking-slots.ts — which times the website may offer.
 *
 * Pure: no database, no network, no calendar library. Dates here are AD
 * "YYYY-MM-DD" text and times are "HH:MM" on a 24-hour clock, both as a clock
 * in Nepal reads them, whatever clock the server keeps.
 *
 * The owner's rules (C-029):
 *  - the clinic is open 6 AM to 10 PM, every day;
 *  - a consultation is a quarter of an hour, so the last one starts at 9:45;
 *  - the website may only offer a time at least three hours from now. At
 *    6 PM the first time on offer is 9 PM; at 8 PM it is 6 AM tomorrow;
 *  - and no further ahead than thirty days.
 *
 * The front desk is not bound by any of this. It books whatever the clinic
 * agrees to, as it always has.
 */
import { overlaps, minutesOf, hhmmOf } from "@/lib/appointment-types";

export const OPENS_AT = "06:00";
export const CLOSES_AT = "22:00";
export const SLOT_MINUTES = 15;
export const LEAD_HOURS = 3;
export const HORIZON_DAYS = 30;

const OPEN_MIN = 6 * 60;
const CLOSE_MIN = 22 * 60;
const LEAD_MIN = LEAD_HOURS * 60;

/** Nepal is UTC+5:45 all year round; it has no summer time. */
const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOfUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** A real calendar date in "YYYY-MM-DD" form — not 2026-02-30. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return isoOfUtc(dt) === s;
}

/** `iso` plus `days` (which may be negative). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOfUtc(new Date(Date.UTC(y!, m! - 1, d! + days)));
}

/** The date and time of day in Nepal at the moment `now`. */
export function nepalClock(now: Date): { dateAd: string; minutes: number } {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MINUTES * 60_000);
  return {
    dateAd: isoOfUtc(shifted),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Every start time in a day the clinic is open: 06:00, 06:15 … 21:45. */
export function openingSlots(): string[] {
  const out: string[] = [];
  for (let m = OPEN_MIN; m + SLOT_MINUTES <= CLOSE_MIN; m += SLOT_MINUTES) {
    out.push(hhmmOf(m));
  }
  return out;
}

/**
 * The first moment the website may offer: three hours from now, as a date and
 * minutes past midnight (which may run into tomorrow).
 */
export function earliestMoment(now: Date): { dateAd: string; minutes: number } {
  const { dateAd, minutes } = nepalClock(now);
  const later = minutes + LEAD_MIN;
  if (later >= 24 * 60) {
    return { dateAd: addDays(dateAd, 1), minutes: later - 24 * 60 };
  }
  return { dateAd, minutes: later };
}

/** The last day the website may offer. */
export function lastBookableDay(now: Date): string {
  return addDays(nepalClock(now).dateAd, HORIZON_DAYS);
}

/**
 * The first slot the website can actually offer, ignoring who is booked —
 * the answer to "when is the soonest I could come?".
 */
export function firstOfferable(now: Date): { dateAd: string; timeHhmm: string } {
  const e = earliestMoment(now);
  const first = openingSlots().find((t) => minutesOf(t) >= e.minutes);
  if (first) return { dateAd: e.dateAd, timeHhmm: first };
  return { dateAd: addDays(e.dateAd, 1), timeHhmm: OPENS_AT };
}

export type SlotProblem =
  | "bad_date"
  | "bad_time"
  | "outside_hours"
  | "too_soon"
  | "too_far";

/** What is wrong with a requested time, in words a website can show. */
export const SLOT_PROBLEM_MESSAGE: Record<SlotProblem, string> = {
  bad_date: "Choose a date.",
  bad_time: "Choose a time.",
  outside_hours: `The clinic sees patients from 6 AM to 10 PM, every quarter hour.`,
  too_soon: `Choose a time at least ${LEAD_HOURS} hours from now.`,
  too_far: `Bookings can be made up to ${HORIZON_DAYS} days ahead.`,
};

/**
 * Whether the website may ask for this date and time at all, before anybody
 * looks at who else is booked. Null when it may.
 */
export function slotProblem(
  dateAd: string,
  timeHhmm: string,
  now: Date,
): SlotProblem | null {
  if (!isIsoDate(dateAd)) return "bad_date";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeHhmm)) return "bad_time";
  if (!openingSlots().includes(timeHhmm)) return "outside_hours";

  const e = earliestMoment(now);
  if (dateAd < e.dateAd) return "too_soon";
  if (dateAd === e.dateAd && minutesOf(timeHhmm) < e.minutes) return "too_soon";
  if (dateAd > lastBookableDay(now)) return "too_far";
  return null;
}

export interface Taken {
  timeHhmm: string;
  durationMin: number;
}

/**
 * The times the website may offer on one day with one doctor: open hours,
 * three hours' notice, thirty days ahead, and nobody already in the slot.
 */
export function freeSlots(dateAd: string, now: Date, taken: Taken[]): string[] {
  if (!isIsoDate(dateAd)) return [];
  return openingSlots().filter(
    (t) =>
      slotProblem(dateAd, t, now) === null &&
      !taken.some((x) =>
        overlaps(x, { timeHhmm: t, durationMin: SLOT_MINUTES }),
      ),
  );
}

/**
 * Has a request's time already gone by? A request nobody acted on before its
 * time arrives is expired, and its slot goes back.
 */
export function hasPassed(dateAd: string, timeHhmm: string, now: Date): boolean {
  const { dateAd: today, minutes } = nepalClock(now);
  if (dateAd < today) return true;
  if (dateAd > today) return false;
  return minutesOf(timeHhmm) <= minutes;
}
