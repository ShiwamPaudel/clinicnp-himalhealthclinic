/**
 * The times the website may offer (C-029): 6 AM to 10 PM, quarter hours,
 * three hours' notice, thirty days ahead — all on Nepal's clock, whatever the
 * server's is.
 */
import { describe, it, expect } from "vitest";
import {
  nepalClock,
  earliestMoment,
  firstOfferable,
  freeSlots,
  slotProblem,
  openingSlots,
  hasPassed,
  addDays,
  isIsoDate,
  lastBookableDay,
} from "@/lib/web-booking-slots";

/** A moment given as Nepal wall-clock time (UTC+5:45). */
function npt(dateAd: string, hhmm: string): Date {
  const [y, m, d] = dateAd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, h!, mi!) - (5 * 60 + 45) * 60_000);
}

const DAY = "2026-11-27";
const NEXT = "2026-11-28";

describe("the clock is Nepal's", () => {
  it("reads 18:00 in Nepal as 18:00, not the server's UTC", () => {
    expect(nepalClock(npt(DAY, "18:00"))).toEqual({ dateAd: DAY, minutes: 18 * 60 });
  });

  it("is already tomorrow in Nepal at 00:30 while UTC is still yesterday", () => {
    const at = npt(NEXT, "00:30");
    expect(at.toISOString().slice(0, 10)).toBe(DAY);
    expect(nepalClock(at).dateAd).toBe(NEXT);
  });
});

describe("opening hours", () => {
  it("runs 06:00 to 21:45 in quarter hours, so the last visit ends at 10 PM", () => {
    const s = openingSlots();
    expect(s[0]).toBe("06:00");
    expect(s[s.length - 1]).toBe("21:45");
    expect(s).toHaveLength(64);
    expect(s).not.toContain("22:00");
  });
});

describe("three hours' notice — the owner's examples", () => {
  it("at 6 PM, the first time on offer is 9 PM today", () => {
    expect(firstOfferable(npt(DAY, "18:00"))).toEqual({ dateAd: DAY, timeHhmm: "21:00" });
    const slots = freeSlots(DAY, npt(DAY, "18:00"), []);
    expect(slots).toEqual(["21:00", "21:15", "21:30", "21:45"]);
  });

  it("at 6:10 PM, it rounds up to 9:15 PM", () => {
    expect(firstOfferable(npt(DAY, "18:10"))).toEqual({ dateAd: DAY, timeHhmm: "21:15" });
  });

  it("at 8 PM, nothing is left today and tomorrow starts at 6 AM", () => {
    const now = npt(DAY, "20:00");
    expect(freeSlots(DAY, now, [])).toEqual([]);
    expect(firstOfferable(now)).toEqual({ dateAd: NEXT, timeHhmm: "06:00" });
    expect(freeSlots(NEXT, now, [])[0]).toBe("06:00");
  });

  it("at 11 PM, three hours on is 2 AM tomorrow, so tomorrow still opens at 6", () => {
    const now = npt(DAY, "23:00");
    expect(earliestMoment(now)).toEqual({ dateAd: NEXT, minutes: 2 * 60 });
    expect(freeSlots(NEXT, now, [])[0]).toBe("06:00");
  });

  it("at 4 AM, the first time is 7 AM the same day", () => {
    expect(firstOfferable(npt(DAY, "04:00"))).toEqual({ dateAd: DAY, timeHhmm: "07:00" });
  });

  it("exactly three hours ahead is allowed; one minute less is not", () => {
    expect(slotProblem(DAY, "21:00", npt(DAY, "18:00"))).toBeNull();
    expect(slotProblem(DAY, "21:00", npt(DAY, "18:01"))).toBe("too_soon");
  });
});

describe("what may be asked for", () => {
  const now = npt(DAY, "09:00");

  it("refuses a time outside 6 AM to 10 PM, or off the quarter hour", () => {
    expect(slotProblem(NEXT, "05:45", now)).toBe("outside_hours");
    expect(slotProblem(NEXT, "22:00", now)).toBe("outside_hours");
    expect(slotProblem(NEXT, "10:05", now)).toBe("outside_hours");
    expect(slotProblem(NEXT, "10:15", now)).toBeNull();
  });

  it("refuses the past, and more than thirty days ahead", () => {
    expect(slotProblem("2026-11-26", "10:00", now)).toBe("too_soon");
    expect(lastBookableDay(now)).toBe("2026-12-27");
    expect(slotProblem("2026-12-27", "10:00", now)).toBeNull();
    expect(slotProblem("2026-12-28", "10:00", now)).toBe("too_far");
  });

  it("refuses a date that does not exist, and a time that is not one", () => {
    expect(slotProblem("2026-02-30", "10:00", now)).toBe("bad_date");
    expect(slotProblem("28-11-2026", "10:00", now)).toBe("bad_date");
    expect(slotProblem(NEXT, "9:00", now)).toBe("bad_time");
    expect(slotProblem(NEXT, "25:00", now)).toBe("bad_time");
  });
});

describe("taken slots", () => {
  const now = npt(DAY, "09:00");

  it("leaves out a slot somebody has, and keeps the ones either side of it", () => {
    const s = freeSlots(NEXT, now, [{ timeHhmm: "10:00", durationMin: 15 }]);
    expect(s).toContain("09:45");
    expect(s).not.toContain("10:00");
    expect(s).toContain("10:15");
  });

  it("a desk booking of 30 minutes takes two slots", () => {
    const s = freeSlots(NEXT, now, [{ timeHhmm: "10:00", durationMin: 30 }]);
    expect(s).not.toContain("10:00");
    expect(s).not.toContain("10:15");
    expect(s).toContain("10:30");
  });

  it("an off-grid desk booking at 10:05 blocks both slots it touches", () => {
    const s = freeSlots(NEXT, now, [{ timeHhmm: "10:05", durationMin: 15 }]);
    expect(s).not.toContain("10:00");
    expect(s).not.toContain("10:15");
    expect(s).toContain("09:45");
    expect(s).toContain("10:30");
  });
});

describe("helpers", () => {
  it("adds days across a month and a year", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows real dates", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });

  it("a request's time has passed once the clock reaches it", () => {
    const now = npt(DAY, "14:00");
    expect(hasPassed(DAY, "14:00", now)).toBe(true);
    expect(hasPassed(DAY, "14:15", now)).toBe(false);
    expect(hasPassed("2026-11-26", "21:45", now)).toBe(true);
    expect(hasPassed(NEXT, "06:00", now)).toBe(false);
  });
});
