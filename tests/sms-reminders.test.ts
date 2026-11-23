/**
 * Monthly SMS reminders — the pure parts (C-028).
 *
 *  - the message is filled in, and a typo in braces is caught
 *  - what a message costs: 160 to an SMS, 70 once anything non-standard is in it
 *  - mobile numbers as people type them
 *  - the same Nepali day every month, cut short in a short month and back after
 *  - "today" is Nepal's today on a server that runs on UTC
 *  - due today or yesterday; missed before that
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SMS_MESSAGE,
  fillMessage,
  hasCurlyQuotes,
  isNepaliMobile,
  mobileProblem,
  normalizeMobile,
  smsSize,
  straightenQuotes,
  unknownPlaceholders,
} from "@/lib/sms-text";
import {
  addDaysIso,
  describeSchedule,
  dueState,
  nepalWhen,
  nextOccurrence,
  occurrenceIn,
  ordinal,
  upcomingDates,
} from "@/lib/sms-schedule";
import { bsDaysInMonth, bsToDbText, todayInNepal, toBS } from "@/lib/bs";

const v = { name: "Sita Sharma", date: "10 Poush 2083", clinic: "Sample Clinic" };

describe("the message", () => {
  it("fills in the name, the date and the clinic, whatever the spacing or case", () => {
    expect(fillMessage("Namaste {name} Ji, {date} — {clinic}", v)).toBe(
      "Namaste Sita Sharma Ji, 10 Poush 2083 — Sample Clinic",
    );
    expect(fillMessage("{ Name } / {CLINIC}", v)).toBe("Sita Sharma / Sample Clinic");
  });

  it("leaves anything it does not know in braces, and says so", () => {
    expect(fillMessage("Hi {nmae}", v)).toBe("Hi {nmae}");
    expect(unknownPlaceholders("Hi {nmae} and {name} and {phone} {phone}")).toEqual([
      "{nmae}",
      "{phone}",
    ]);
    expect(unknownPlaceholders(DEFAULT_SMS_MESSAGE)).toEqual([]);
  });

  it("is the owner's Nepali wording, one SMS, under 65 characters", () => {
    const size = smsSize(fillMessage(DEFAULT_SMS_MESSAGE, v));
    expect(size.unicode).toBe(true);
    expect(size.parts).toBe(1);
    expect(size.length).toBeLessThan(65);
  });

  it("Himal's signed message is one SMS too, under 69 characters (C-028)", () => {
    const himal = "मासिक औषधि तयार छ। डेलिभरी वा लिन फोन गर्नुहोस्।\nहिमाल हेल्थ क्लिनिक";
    expect(smsSize(himal)).toEqual({ length: 68, parts: 1, unicode: true });
    // Signed in English instead, it costs exactly the same.
    expect(smsSize(himal.replace("हिमाल हेल्थ क्लिनिक", "Himal Health Clinic")).length).toBe(68);
    // The owner's first draft, for the record: two SMS.
    expect(
      smsSize("तपाईंको मासिक औषधि तयार छ। डेलिभरी वा क्लिनिकबाट लिन फोन गर्नुहोला। – Himal Health Clinic").parts,
    ).toBe(2);
  });
});

describe("what a message costs", () => {
  it("is 160 to one SMS, then 153 to each part", () => {
    expect(smsSize("a".repeat(160))).toEqual({ length: 160, parts: 1, unicode: false });
    expect(smsSize("a".repeat(161)).parts).toBe(2);
    expect(smsSize("a".repeat(306)).parts).toBe(2);
    expect(smsSize("a".repeat(307)).parts).toBe(3);
  });

  it("counts the few characters that take two places as two", () => {
    expect(smsSize("[]").length).toBe(4);
    expect(smsSize("€").length).toBe(2);
  });

  it("is 70 to one SMS once there is Nepali script, then 67 to each part", () => {
    expect(smsSize("न".repeat(70))).toEqual({ length: 70, parts: 1, unicode: true });
    expect(smsSize("न".repeat(71)).parts).toBe(2);
  });

  it("one curly apostrophe makes the whole message cost the dearer way", () => {
    const straight = "We'll " + "a".repeat(150);
    const curly = "We’ll " + "a".repeat(150);
    expect(smsSize(straight).parts).toBe(1);
    expect(smsSize(curly).parts).toBe(3);
    expect(hasCurlyQuotes(curly)).toBe(true);
    expect(hasCurlyQuotes(straight)).toBe(false);
    expect(straightenQuotes("‘a’ “b”")).toBe("'a' \"b\"");
  });
});

describe("a refusal from the SMS service, in our words", () => {
  it("names the address problem, credit and the token; anything else stays general", async () => {
    const { explainRefusal } = await import("@/lib/sms");
    // The service's real answer, seen on 2083-08-07.
    expect(explainRefusal("The requested ip is not valid.")).toMatch(/does not accept messages from this system's address/);
    expect(explainRefusal("Insufficient credit.")).toMatch(/out of credit/);
    expect(explainRefusal("The provided Auth Token is not valid.")).toMatch(/did not recognise this system/);
    expect(explainRefusal("Something new")).toMatch(/turned the message down/);
    expect(explainRefusal(undefined)).toMatch(/turned the message down/);
    // "description" contains "ip" inside a word and must not count.
    expect(explainRefusal("bad description")).toMatch(/turned the message down/);
  });
});

describe("the number", () => {
  it("takes the number the way people type it", () => {
    expect(normalizeMobile("98-4123 4567")).toBe("9841234567");
    expect(normalizeMobile("+977 9841234567")).toBe("9841234567");
    expect(normalizeMobile("9779841234567")).toBe("9841234567");
    expect(normalizeMobile("(984) 123.4567")).toBe("9841234567");
  });

  it("accepts ten digits starting with 9, and nothing else", () => {
    expect(isNepaliMobile("9841234567")).toBe(true);
    expect(isNepaliMobile("9612345678")).toBe(true);
    expect(isNepaliMobile("984123456")).toBe(false);
    expect(isNepaliMobile("016612345")).toBe(false);
    expect(isNepaliMobile("8841234567")).toBe(false);
  });

  it("says plainly what is wrong with one that will not do", () => {
    expect(mobileProblem("")).toMatch(/Enter a mobile number/);
    expect(mobileProblem("98412abc67")).toMatch(/digits only/);
    expect(mobileProblem("01-6612345")).toMatch(/landline/);
    expect(mobileProblem("9841234567")).toBeNull();
  });
});

describe("the same day every month", () => {
  it("goes on the same day next month", () => {
    expect(nextOccurrence({ year: 2083, month: 8, day: 10 }, 10)).toEqual({
      year: 2083,
      month: 9,
      day: 10,
    });
  });

  it("goes from Chaitra into Baishakh of the next year", () => {
    expect(nextOccurrence({ year: 2083, month: 12, day: 10 }, 10)).toEqual({
      year: 2084,
      month: 1,
      day: 10,
    });
  });

  it("takes the last day of a month too short for it, and comes back after", () => {
    // Find a month with 32 days followed by one with fewer — the calendar
    // itself says which, so the test does not depend on a typed table.
    let found: { year: number; month: number } | null = null;
    for (let year = 2081; year <= 2086 && !found; year++) {
      for (let month = 1; month <= 11 && !found; month++) {
        if (bsDaysInMonth(year, month) === 32 && bsDaysInMonth(year, month + 1) < 32) {
          found = { year, month };
        }
      }
    }
    expect(found).not.toBeNull();
    const { year, month } = found!;
    const shortLen = bsDaysInMonth(year, month + 1);

    const next = nextOccurrence({ year, month, day: 32 }, 32);
    expect(next).toEqual({ year, month: month + 1, day: shortLen });

    // Back to the 32nd the next time a month has one.
    let d = next;
    for (let i = 0; i < 12; i++) {
      d = nextOccurrence(d, 32);
      expect(d.day).toBe(Math.min(32, bsDaysInMonth(d.year, d.month)));
    }
    expect(occurrenceIn(year, month, 32).day).toBe(32);
  });

  it("lists the next few dates for the form", () => {
    expect(upcomingDates({ year: 2083, month: 8, day: 10 }, 10, 3).map(bsToDbText)).toEqual([
      "2083-08-10",
      "2083-09-10",
      "2083-10-10",
    ]);
  });

  it("says the day the way people say it", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30, 31, 32].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "30th", "31st", "32nd",
    ]);
    expect(describeSchedule(10)).toBe("Every month on the 10th");
  });
});

describe("Nepal's today, on a server that keeps UTC", () => {
  it("turns over at 18:15 UTC, which is midnight in Nepal", () => {
    const before = todayInNepal(new Date("2026-11-23T18:14:59Z"));
    const after = todayInNepal(new Date("2026-11-23T18:15:00Z"));
    expect(before).toEqual(toBS(new Date(2026, 10, 23)));
    expect(after).toEqual(toBS(new Date(2026, 10, 24)));
  });

  it("is already Nepal's date at 00:15 UTC, when the 6 AM run starts", () => {
    expect(todayInNepal(new Date("2026-11-24T00:15:00Z"))).toEqual(
      toBS(new Date(2026, 10, 24)),
    );
  });

  it("writes a stored time as a clock in Nepal reads it", () => {
    expect(nepalWhen("2026-11-24T01:17:00Z")).toMatch(/, 7:02 AM$/);
    expect(nepalWhen("2026-11-23T18:15:00Z")).toMatch(/, 12:00 AM$/);
    expect(nepalWhen("not a time")).toBe("");
  });
});

describe("what the morning run does with a date", () => {
  it("leaves a date to come, sends today's and yesterday's, and calls older ones missed", () => {
    const today = "2026-11-24";
    expect(dueState("2026-11-25", today)).toBe("later");
    expect(dueState("2026-11-24", today)).toBe("due");
    expect(dueState("2026-11-23", today)).toBe("due");
    expect(dueState("2026-11-22", today)).toBe("missed");
  });

  it("counts days across a month end", () => {
    expect(addDaysIso("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
  });
});
