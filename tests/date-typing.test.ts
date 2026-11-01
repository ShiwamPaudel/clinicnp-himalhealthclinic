/**
 * Typing a date the way a pack prints it (D-156). A date read one day or one
 * month off would put a wrong expiry on a batch without anybody noticing, so
 * every accepted form is pinned to the exact AD day it must land on, and that
 * day is checked to round-trip through the BS text the box emits.
 */
import { describe, it, expect } from "vitest";
import { parseTypedDate, type MonthOnly } from "@/lib/date-typing";
import { adToIso, bsFromDbText, toAD } from "@/lib/bs";

/** The AD day a typed text lands on, or the refusal reason. */
function read(text: string, monthOnly: MonthOnly = "end"): string {
  const r = parseTypedDate(text, monthOnly);
  if (!r.ok) return `refused: ${r.reason}`;
  // The BS text emitted must be exactly the AD day reported.
  expect(adToIso(toAD(bsFromDbText(r.bsText)))).toBe(adToIso(r.ad));
  return adToIso(r.ad);
}

describe("a month and year, as packs print an expiry", () => {
  it("reads Nov 29 as the last day of November 2029", () => {
    expect(read("Nov 29")).toBe("2029-11-30");
  });

  it("accepts the ways a pack writes it", () => {
    for (const text of [
      "Nov 29",
      "nov 29",
      "NOV 29",
      "Nov 2029",
      "November 29",
      "Novem 2029",
      "Nov-29",
      "Nov/29",
      "Nov.29",
      "Nov'29",
      "Nov29",
      "NOV2029",
      "11/29",
      "11-29",
      "11.29",
      "11/2029",
      "2029-11",
      "2029 Nov",
      "EXP NOV 29",
      "Exp. 11/2029",
      "expiry: Nov 29",
      "  Nov   29  ",
    ]) {
      expect(read(text), text).toBe("2029-11-30");
    }
  });

  it("uses the first day for a manufacture date", () => {
    expect(read("Nov 24", "start")).toBe("2024-11-01");
    expect(read("MFD 11/24", "start")).toBe("2024-11-01");
    expect(read("mfg date: 2024-11", "start")).toBe("2024-11-01");
  });

  it("knows how long each month is, February included", () => {
    expect(read("Feb 28")).toBe("2028-02-29"); // leap year
    expect(read("Feb 29")).toBe("2029-02-28");
    expect(read("Apr 30")).toBe("2030-04-30");
    expect(read("Dec 27")).toBe("2027-12-31");
    expect(read("1/27")).toBe("2027-01-31");
    expect(read("Sept 27")).toBe("2027-09-30");
  });

  it("says it was only a month", () => {
    const r = parseTypedDate("Nov 29", "end");
    expect(r.ok && r.monthOnly).toBe(true);
    const full = parseTypedDate("15 Nov 2029", "end");
    expect(full.ok && full.monthOnly).toBe(false);
  });
});

describe("a full date", () => {
  it("takes the day as typed, whichever kind of box it is", () => {
    for (const text of [
      "15 Nov 2029",
      "15 Nov 29",
      "15-Nov-2029",
      "15nov2029",
      "Nov 15 2029",
      "Nov 15, 2029",
      "15/11/2029",
      "15-11-29",
      "15.11.2029",
      "2029-11-15",
      "2029 Nov 15",
    ]) {
      expect(read(text, "end"), text).toBe("2029-11-15");
      expect(read(text, "start"), text).toBe("2029-11-15");
    }
  });

  it("reads numbers as day/month/year, as written in Nepal", () => {
    expect(read("3/4/2028")).toBe("2028-04-03");
  });
});

describe("refusing rather than guessing", () => {
  it("refuses a day with no year", () => {
    expect(read("29 Nov")).toMatch(/^refused: Add the year/);
  });

  it("refuses a Nepali year typed by habit", () => {
    expect(read("2086-08-15")).toMatch(/^refused: 2086 is a Nepali year/);
    expect(read("Nov 2083")).toMatch(/Nepali year/);
  });

  it("refuses days and months that do not exist", () => {
    expect(read("31/11/2029")).toMatch(/^refused: November 2029 has 30 days/);
    expect(read("30 Feb 2029")).toMatch(/has 28 days/);
    expect(read("13/29")).toMatch(/^refused: The month must be 1 to 12/);
    expect(read("0/29")).toMatch(/month must be/);
    expect(read("15/13/2029")).toMatch(/month must be/);
  });

  it("refuses what is not a date at all", () => {
    for (const text of ["", "   ", "abc", "Nov", "29", "2029", "Ju 29", "Nov 2", "Nov 202", "1129", "Nov Dec 29", "11/29/30/1", "Nov 29 ✓"]) {
      expect(read(text), text).toMatch(/^refused: /);
    }
  });

  it("refuses dates outside the calendar", () => {
    expect(read("Dec 2034")).toMatch(/^refused: That date is outside the calendar/);
    expect(read("Jan 1900")).toMatch(/outside the calendar/);
  });
});
