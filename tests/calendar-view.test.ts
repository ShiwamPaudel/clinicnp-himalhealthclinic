/**
 * The date box's two faces (D-137). Whatever calendar a person picks from,
 * the box must emit the BS text for exactly the day they touched — a pick one
 * day off would put a wrong expiry on a batch without anybody noticing.
 */
import { describe, it, expect } from "vitest";
import {
  canStep,
  clampView,
  formatInCalendar,
  monthGrid,
  parseBsValue,
  stepView,
  supportedAdRange,
  switchCalendar,
  viewContaining,
  type MonthView,
} from "@/lib/calendar-view";
import { adToIso, bsDayOfWeek, bsFromDbText, bsMonthRange, toAD } from "@/lib/bs";

describe("picking from the English grid", () => {
  it("emits the BS text of the very day touched, for every day from 2020 to the end of the range", () => {
    const { lastAd } = supportedAdRange();
    let checked = 0;
    for (let view: MonthView = { calendar: "ad", year: 2020, month: 1 }; ; ) {
      for (const d of monthGrid(view).days) {
        if (d.disabled) continue;
        const back = toAD(bsFromDbText(d.bsText));
        expect(adToIso(back)).toBe(
          `${view.year}-${String(view.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        );
        checked++;
      }
      if (!canStep(view, 1)) break;
      view = stepView(view, 1);
    }
    // 2020-01-01 through the last supported day, with nothing skipped.
    const expected =
      Math.round((lastAd.getTime() - new Date(2020, 0, 1).getTime()) / 86_400_000) + 1;
    expect(checked).toBe(expected);
  });

  it("puts each day under its own weekday", () => {
    const g = monthGrid({ calendar: "ad", year: 2026, month: 9 });
    expect(g.leadingBlanks).toBe(new Date(2026, 8, 1).getDay());
    for (const d of g.days) {
      expect(d.weekday).toBe(new Date(2026, 8, d.day).getDay());
    }
    expect(g.days).toHaveLength(30);
  });

  it("names the Nepali months the English month runs across", () => {
    // 1 September 2026 is 16 Bhadra 2083; 30 September is 14 Ashwin.
    expect(monthGrid({ calendar: "ad", year: 2026, month: 9 }).subtitle).toBe(
      "Bhadra – Ashwin 2083",
    );
    // April crosses the Nepali new year.
    expect(monthGrid({ calendar: "ad", year: 2026, month: 4 }).subtitle).toBe(
      "Chaitra 2082 – Baishakh 2083",
    );
  });
});

describe("the Nepali grid", () => {
  it("is laid out as it always was", () => {
    const g = monthGrid({ calendar: "bs", year: 2083, month: 6 });
    const { endBs, startAd } = bsMonthRange(2083, 6);
    expect(g.days).toHaveLength(endBs.day);
    expect(g.leadingBlanks).toBe(bsDayOfWeek({ year: 2083, month: 6, day: 1 }));
    expect(g.title).toBe("आश्विन 2083");
    expect(g.subtitle).toBe(`Ashwin · ${adToIso(startAd)}`);
    expect(g.days[5]!.bsText).toBe("2083-06-06");
  });
});

describe("switching calendars inside the box", () => {
  it("lands on the month holding the chosen date", () => {
    // 6 Ashwin 2083 is 22 September 2026.
    const bsView: MonthView = { calendar: "bs", year: 2083, month: 6 };
    expect(switchCalendar(bsView, "2083-06-06")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
    const adView: MonthView = { calendar: "ad", year: 2026, month: 9 };
    expect(switchCalendar(adView, "2083-06-06")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 6,
    });
  });

  it("with nothing chosen, keeps the place you were looking at", () => {
    // Ashwin 2083 begins on 17 September 2026.
    expect(switchCalendar({ calendar: "bs", year: 2083, month: 6 }, "")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
    // 1 September 2026 is in Bhadra.
    expect(switchCalendar({ calendar: "ad", year: 2026, month: 9 }, "")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 5,
    });
  });

  it("opens either calendar on the chosen date's month", () => {
    expect(viewContaining("bs", "2083-06-06")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 6,
    });
    expect(viewContaining("ad", "2083-06-06")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
  });
});

describe("the edges of what the converter can do", () => {
  it("stops at the last month it can lay out instead of failing", () => {
    const lastBs = clampView({ calendar: "bs", year: 2095, month: 1 });
    expect(lastBs).toEqual({ calendar: "bs", year: 2090, month: 11 });
    expect(canStep(lastBs, 1)).toBe(false);
    expect(stepView(lastBs, 12)).toEqual(lastBs);
    expect(() => monthGrid(lastBs)).not.toThrow();

    const { lastAd } = supportedAdRange();
    const lastAdView = clampView({ calendar: "ad", year: 2040, month: 1 });
    expect(lastAdView).toEqual({
      calendar: "ad",
      year: lastAd.getFullYear(),
      month: lastAd.getMonth() + 1,
    });
    expect(canStep(lastAdView, 1)).toBe(false);
    const after = monthGrid(lastAdView).days.filter((d) => d.day > lastAd.getDate());
    expect(after.every((d) => d.disabled && d.bsText === "")).toBe(true);
  });

  it("offers no day before the first one it knows", () => {
    const { firstAd } = supportedAdRange();
    const first = clampView({ calendar: "ad", year: 1900, month: 1 });
    expect(canStep(first, -1)).toBe(false);
    for (const d of monthGrid(first).days) {
      expect(d.disabled).toBe(d.day < firstAd.getDate());
    }
  });

  it("reaches ten years ahead, well past any expiry date", () => {
    expect(supportedAdRange().lastAd.getFullYear()).toBeGreaterThanOrEqual(2034);
  });
});

describe("writing a date out", () => {
  it("in either calendar", () => {
    expect(formatInCalendar("2083-06-06", "bs")).toBe("6 Ashwin 2083");
    expect(formatInCalendar("2083-06-06", "ad")).toBe("22 Sep 2026");
  });

  it("ignores values that are not dates", () => {
    expect(parseBsValue("")).toBeNull();
    expect(parseBsValue(undefined)).toBeNull();
    expect(parseBsValue("tomorrow")).toBeNull();
    expect(parseBsValue("2099-01-01")).toBeNull();
    expect(formatInCalendar("", "ad")).toBe("");
  });
});
