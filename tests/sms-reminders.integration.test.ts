/**
 * Monthly SMS reminders against a real database (C-028).
 *
 *  - setting one up twice is one reminder; a blank patient phone is filled,
 *    a phone already on file is never replaced
 *  - the morning run sends what is due, once, even run twice or at once
 *  - then it moves on to the same day next month
 *  - a failure that may come right is tried once more the next morning
 *  - a refused number is not tried again
 *  - a month that went by unsent is written down as missed
 *  - a stopped reminder sends nothing; a later one waits
 *  - the shared message, or its own, filled in for that patient
 *  - merging two patients takes the reminders along
 *
 * The SMS service is never called: a stand-in records what would be sent.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SmsResult } from "@/lib/sms";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `sms-reminders.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

/** 7:05 in the morning in Nepal on 24 November 2026. */
const NOW = new Date("2026-11-24T01:20:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO company (id, name, updated_at) VALUES (1, 'Sample Clinic', 't')`,
  );
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Anita','anita','x','staff','t')`,
  );
  const people: [string, string, string][] = [
    ["p_blank", "Sample Sharma", ""],
    ["p_has", "Sample Thapa", "9800000002"],
    ["p3", "Sample Gurung", ""],
    ["p4", "Sample Rai", ""],
    ["p_keep", "Sample Kept", ""],
    ["p_dup", "Sample Duplicate", ""],
  ];
  for (const [id, name, phone] of people) {
    await raw.execute({
      sql: `INSERT INTO patients (id, name, sex, phone, active, created_at, updated_at)
            VALUES (?, ?, 'f', ?, 1, 't', 't')`,
      args: [id, name, phone],
    });
  }
  raw.close();
});

/** Each test starts with nothing running, so one test's reminders never reach another's run. */
beforeEach(async () => {
  const { db } = await import("@/lib/db");
  await db().execute("UPDATE sms_reminders SET status = 'stopped' WHERE status = 'active'");
});

async function repo() {
  return import("@/lib/repos/sms-reminders");
}

async function dates() {
  const bs = await import("@/lib/bs");
  const sched = await import("@/lib/sms-schedule");
  /** BS text for NOW plus `days`, as Nepal's calendar has it. */
  const bsAt = (days: number) => bs.bsToDbText(bs.todayInNepal(at(days)));
  return { bsAt, adOf: sched.bsTextToAdIso, next: sched.nextOccurrence, bs };
}

/** A stand-in for the SMS service that answers whatever it is told to. */
function fakeSender(answers: SmsResult[] = []) {
  const calls: { to: string; text: string }[] = [];
  const send = async (to: string, text: string): Promise<SmsResult> => {
    calls.push({ to, text });
    return answers.shift() ?? { ok: true, providerId: String(calls.length), credits: 2 };
  };
  return { calls, send };
}

async function run(send: ReturnType<typeof fakeSender>["send"], now = NOW) {
  const { runSmsReminders } = await import("@/lib/sms-run");
  return runSmsReminders({ send, clinicName: "Sample Clinic", now });
}

async function setUp(id: string, patientId: string, nextBs: string, extra: { phone?: string; message?: string } = {}) {
  const { createReminder } = await repo();
  const { adOf, bs } = await dates();
  return createReminder({
    id,
    patientId,
    phone: extra.phone ?? "9811111111",
    dayOfMonth: bs.bsFromDbText(nextBs).day,
    nextDateBs: nextBs,
    nextDateAd: adOf(nextBs),
    message: extra.message ?? "",
    createdBy: "u1",
  });
}

describe("setting up a reminder", () => {
  it("is one reminder when the same one is sent twice", async () => {
    const { bsAt } = await dates();
    const first = await setUp("r_same", "p3", bsAt(5));
    const again = await setUp("r_same", "p3", bsAt(5));
    expect(again.reminder.id).toBe(first.reminder.id);
    const { db } = await import("@/lib/db");
    const n = await db().execute("SELECT COUNT(*) AS n FROM sms_reminders WHERE id = 'r_same'");
    expect(Number(n.rows[0]!.n)).toBe(1);
  });

  it("fills a blank patient phone, and never replaces one already on file", async () => {
    const { bsAt } = await dates();
    const { getPatient } = await import("@/lib/repos/patients");

    const a = await setUp("r_blank", "p_blank", bsAt(5), { phone: "9812345678" });
    expect(a.phoneSavedToPatient).toBe(true);
    expect((await getPatient("p_blank"))!.phone).toBe("9812345678");

    const b = await setUp("r_has", "p_has", bsAt(5), { phone: "9898989898" });
    expect(b.phoneSavedToPatient).toBe(false);
    expect((await getPatient("p_has"))!.phone).toBe("9800000002");
    expect(b.reminder.phone).toBe("9898989898");
  });
});

describe("the morning run", () => {
  it("sends today's reminder once, and moves it on to the same day next month", async () => {
    const { bsAt, next, bs } = await dates();
    const today = bsAt(0);
    await setUp("r_today", "p3", today);

    const s = fakeSender();
    const summary = await run(s.send);
    expect(summary.sent).toBe(1);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.to).toBe("9811111111");

    const { getReminder } = await repo();
    const r = await getReminder("r_today");
    expect(r!.nextDateBs).toBe(bs.bsToDbText(next(bs.bsFromDbText(today), r!.dayOfMonth)));

    // Run again the same morning: nothing more goes out.
    const again = await run(s.send);
    expect(again.sent).toBe(0);
    expect(s.calls).toHaveLength(1);
  });

  it("sends once even when two runs start at the same moment", async () => {
    const { bsAt } = await dates();
    await setUp("r_race", "p3", bsAt(0));
    const s = fakeSender();
    await Promise.all([run(s.send), run(s.send)]);
    expect(s.calls).toHaveLength(1);
  });

  it("fills in the shared message, or the reminder's own, for that patient", async () => {
    const { bsAt } = await dates();
    const { setSharedMessage } = await repo();
    await setSharedMessage("Namaste {name} Ji, from {clinic} on {date}.");
    await setUp("r_shared", "p3", bsAt(0));
    await setUp("r_own", "p4", bsAt(0), { message: "Hello {name}" });

    const s = fakeSender();
    await run(s.send);
    const texts = s.calls.map((c) => c.text).sort();
    expect(texts[0]).toBe("Hello Sample Rai");
    expect(texts[1]).toMatch(/^Namaste Sample Gurung Ji, from Sample Clinic on \d+ \w+ \d{4}\.$/);

    await setSharedMessage("");
  });

  it("tries a failure that may come right once more the next morning", async () => {
    const { bsAt } = await dates();
    const today = bsAt(0);
    await setUp("r_retry", "p3", today);
    const { getReminder, sentForReminder } = await repo();

    const s = fakeSender([{ ok: false, retry: true, detail: "The SMS service could not be reached." }]);
    const first = await run(s.send);
    expect(first.failed).toBe(1);
    expect((await getReminder("r_retry"))!.nextDateBs).toBe(today);

    const second = await run(s.send, at(1));
    expect(second.sent).toBe(1);
    expect(s.calls).toHaveLength(2);
    const log = await sentForReminder("r_retry");
    expect(log).toHaveLength(1);
    expect(log[0]!.status).toBe("sent");
    expect(log[0]!.attempts).toBe(2);
    expect((await getReminder("r_retry"))!.nextDateBs).not.toBe(today);
  });

  it("moves on after the second morning, keeping the reason it did not go", async () => {
    const { bsAt } = await dates();
    const today = bsAt(0);
    await setUp("r_twice", "p3", today);
    const fail: SmsResult = { ok: false, retry: true, detail: "The SMS service could not be reached." };
    const s = fakeSender([fail, fail]);
    await run(s.send);
    await run(s.send, at(1));
    // A third morning sends nothing for that month.
    await run(s.send, at(2));
    expect(s.calls).toHaveLength(2);

    const { getReminder, sentForReminder } = await repo();
    expect((await getReminder("r_twice"))!.nextDateBs).not.toBe(today);
    const log = await sentForReminder("r_twice");
    expect(log[0]!.status).toBe("failed");
    expect(log[0]!.detail).toBe("The SMS service could not be reached.");
  });

  it("does not try a refused number again", async () => {
    const { bsAt } = await dates();
    const today = bsAt(0);
    await setUp("r_bad", "p3", today);
    const s = fakeSender([{ ok: false, retry: false, detail: "The SMS service would not accept this number." }]);
    await run(s.send);
    await run(s.send, at(1));
    expect(s.calls).toHaveLength(1);
    const { getReminder } = await repo();
    expect((await getReminder("r_bad"))!.nextDateBs).not.toBe(today);
  });

  it("writes down a month that went by unsent as missed, and sends nothing late", async () => {
    const { bsAt } = await dates();
    const longAgo = bsAt(-5);
    await setUp("r_missed", "p3", longAgo);
    const s = fakeSender();
    const summary = await run(s.send);
    expect(summary.missed).toBe(1);
    expect(s.calls).toHaveLength(0);

    const { getReminder, sentForReminder } = await repo();
    const r = (await getReminder("r_missed"))!;
    expect(r.nextDateBs > bsAt(0)).toBe(true);
    const log = await sentForReminder("r_missed");
    expect(log[0]!.status).toBe("missed");
    expect(log[0]!.dueDateBs).toBe(longAgo);
  });

  it("sends nothing for a stopped reminder, and waits for a later one", async () => {
    const { bsAt } = await dates();
    await setUp("r_stop", "p3", bsAt(0));
    await setUp("r_later", "p4", bsAt(3));
    const { stopReminder, getReminder } = await repo();
    expect(await stopReminder("r_stop", "u1")).toBe(true);
    expect(await stopReminder("r_stop", "u1")).toBe(false);

    const s = fakeSender();
    await run(s.send);
    expect(s.calls).toHaveLength(0);
    expect((await getReminder("r_later"))!.nextDateBs).toBe(bsAt(3));
    expect((await getReminder("r_stop"))!.stoppedBy).toBe("u1");
  });

  it("a stopped reminder cannot be changed", async () => {
    const { bsAt, adOf } = await dates();
    await setUp("r_frozen", "p3", bsAt(4));
    const { stopReminder, updateReminder } = await repo();
    await stopReminder("r_frozen", "u1");
    const changed = await updateReminder("r_frozen", {
      phone: "9822222222",
      message: "",
      dayOfMonth: 1,
      nextDateBs: bsAt(9),
      nextDateAd: adOf(bsAt(9)),
    });
    expect(changed).toBe(false);
  });
});

describe("the list and the log", () => {
  it("shows each reminder with its patient and the last thing that happened", async () => {
    const { bsAt } = await dates();
    await setUp("r_list", "p4", bsAt(0));
    const s = fakeSender();
    await run(s.send);
    const { getReminderRow, recentSent, recordTestSend } = await repo();
    const row = (await getReminderRow("r_list"))!;
    expect(row.patientName).toBe("Sample Rai");
    expect(row.lastStatus).toBe("sent");
    expect(row.lastDueBs).toBe(bsAt(0));

    await recordTestSend("9833333333", "Test", { ok: false, detail: "SMS sending is not set up yet." });
    const recent = await recentSent(5);
    expect(recent[0]!.reminderId).toBeNull();
    expect(recent[0]!.status).toBe("failed");
  });
});

describe("merging two patients", () => {
  it("takes the reminders to the record that is kept", async () => {
    const { bsAt } = await dates();
    await setUp("r_merge", "p_dup", bsAt(6));
    const { mergePatients } = await import("@/lib/repos/patients");
    await mergePatients("p_keep", "p_dup", "u1");
    const { getReminder } = await repo();
    expect((await getReminder("r_merge"))!.patientId).toBe("p_keep");
  });
});
