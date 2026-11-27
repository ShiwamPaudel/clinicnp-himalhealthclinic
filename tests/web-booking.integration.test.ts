/**
 * Online booking (C-029): what the website asks for, and what the front desk
 * does with it.
 *
 *  - a request holds its slot, from the website and from the desk
 *  - the same submission twice is one request
 *  - nobody gets a patient number until the desk confirms
 *  - confirming twice books once, registers once, and texts once
 *  - confirming can match somebody already on file instead of registering
 *  - declining, and letting the time go by, both give the slot back
 *  - the confirmation text follows the switch, the wording and the number
 *  - merging patients now takes their bookings with them
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SmsSender } from "@/lib/sms";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `web-booking.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

/** Far enough ahead that the real clock never makes these "already passed". */
const DAY = "2030-01-11";
/** Nepal wall-clock 09:00 on the day before. */
const NOW = new Date(Date.UTC(2030, 0, 10, 9, 0) - (5 * 60 + 45) * 60_000);

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
  // Turso runs in WAL mode, where a reader never blocks a writer. The local
  // driver's default (rollback journal) leaves a read lock behind after two
  // write transactions race, which production never sees — so the race test
  // below runs the way production does.
  await raw.execute("PRAGMA journal_mode=WAL");
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
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc1','Dr. Sample Karki','none', 0, 1, 't','t')`,
  );
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc_off','Dr. Sample Away','none', 0, 0, 't','t')`,
  );
  // Somebody already on file, who will book online under the same number.
  await raw.execute(
    `INSERT INTO patients (id, patient_no, name, sex, phone, active, created_at, updated_at)
     VALUES ('p_known', 900, 'Sample Known', 'f', '9800000009', 1, 't', 't')`,
  );
  raw.close();
});

const lib = () => import("@/lib/web-booking");
const repo = () => import("@/lib/repos/web-bookings");

function body(over: Record<string, unknown> = {}, patient: Record<string, unknown> = {}) {
  return {
    requestId: `req-${Math.random().toString(36).slice(2)}-web`,
    doctorId: "doc1",
    date: DAY,
    time: "10:00",
    patient: {
      name: "Sample Online",
      phone: "98-0000-0001",
      sex: "female",
      age: { value: 34, unit: "y" },
      address: "Bhaktapur",
      ...patient,
    },
    reason: "Fever since Monday",
    ...over,
  };
}

async function patientCount(): Promise<number> {
  const { db } = await import("@/lib/db");
  const r = await db().execute("SELECT COUNT(*) AS n FROM patients");
  return Number(r.rows[0]!.n);
}

describe("the website asks", () => {
  it("records a request, with the date in both calendars and the number cleaned up", async () => {
    const { submitWebBooking } = await lib();
    const out = await submitWebBooking(body({ requestId: "req-first-0001" }), NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.existing).toBe(false);
    expect(out.request.status).toBe("pending");
    expect(out.request.dateAd).toBe(DAY);
    expect(out.request.dateBs).toMatch(/^2086-09-\d{2}$/);
    expect(out.request.phone).toBe("9800000001");
    expect(out.request.sex).toBe("f");
    expect(out.request.ref).toMatch(/^W[0-9A-HJKMNP-TV-Z]{7}$/);
  });

  it("gives nobody a patient number for asking", async () => {
    const before = await patientCount();
    const { submitWebBooking } = await lib();
    await submitWebBooking(body({ time: "10:30" }), NOW);
    expect(await patientCount()).toBe(before);
  });

  it("the same submission sent twice is one request", async () => {
    const { submitWebBooking } = await lib();
    const again = await submitWebBooking(body({ requestId: "req-first-0001" }), NOW);
    expect(again.ok && again.existing).toBe(true);
  });

  it("the slot is held: the next person is told it has gone, without being told who has it", async () => {
    const { submitWebBooking } = await lib();
    const out = await submitWebBooking(body({}, { name: "Sample Second", phone: "9800000002" }), NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(409);
    expect(out.code).toBe("slot_taken");
    expect(out.message).not.toContain("Sample Online");
  });

  it("two people pressing Book on the same slot at once: one gets it, one is told it has gone", async () => {
    const { submitWebBooking } = await lib();
    const [a, b] = await Promise.all([
      submitWebBooking(body({ time: "19:00" }, { name: "Sample Race A", phone: "9800000021" }), NOW),
      submitWebBooking(body({ time: "19:00" }, { name: "Sample Race B", phone: "9800000022" }), NOW),
    ]);
    const outcomes = [a, b].map((o) => (o.ok ? "ok" : o.code)).sort();
    expect(outcomes).toEqual(["ok", "slot_taken"]);
  });

  it("the desk cannot book over a waiting request either", async () => {
    const { createAppointment, DoubleBookedError } = await import("@/lib/repos/appointments");
    await expect(
      createAppointment({
        doctorId: "doc1",
        patientId: "p_known",
        dateAd: DAY,
        dateBs: "2086-09-27",
        timeHhmm: "10:05",
        durationMin: 15,
        reason: "",
        bookedBy: "u1",
      }),
    ).rejects.toBeInstanceOf(DoubleBookedError);
  });

  it("the slot list leaves out what is held", async () => {
    const { publicSlots } = await lib();
    const out = await publicSlots("doc1", { date: DAY }, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const times = out.slots.map((s) => s.time);
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("10:15");
    expect(out.slots.find((s) => s.time === "10:15")?.label).toBe("10:15 AM");
  });

  it("refuses too soon, outside hours, a doctor who is away, and a landline", async () => {
    const { submitWebBooking } = await lib();
    const soon = await submitWebBooking(body({ date: "2030-01-10", time: "11:00" }), NOW);
    expect(!soon.ok && soon.code).toBe("too_soon");
    const late = await submitWebBooking(body({ time: "22:00" }), NOW);
    expect(!late.ok && late.code).toBe("outside_hours");
    const away = await submitWebBooking(body({ doctorId: "doc_off" }), NOW);
    expect(!away.ok && away.status).toBe(404);
    const land = await submitWebBooking(body({ time: "11:00" }, { phone: "01-6612345" }), NOW);
    expect(!land.ok && land.field).toBe("patient.phone");
  });

  it("refuses a body that is not a booking, and says which field", async () => {
    const { submitWebBooking } = await lib();
    const out = await submitWebBooking({ ...body(), patient: { name: "", phone: "9800000003", sex: "f" } }, NOW);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(400);
    expect(out.field).toBe("patient.name");
  });

  it("lets one number have only three requests waiting", async () => {
    const { submitWebBooking } = await lib();
    const phone = { phone: "9800000077" };
    for (const t of ["12:00", "12:15", "12:30"]) {
      const ok = await submitWebBooking(body({ time: t }, phone), NOW);
      expect(ok.ok).toBe(true);
    }
    const fourth = await submitWebBooking(body({ time: "12:45" }, phone), NOW);
    expect(!fourth.ok && fourth.code).toBe("too_many_pending");
  });

  it("is told bookings are paused when the owner switches them off", async () => {
    const { setWebBookingSettings, getWebBookingSettings } = await import("@/lib/repos/company");
    const before = await getWebBookingSettings();
    await setWebBookingSettings({ ...before, accepting: false });
    const { submitWebBooking } = await lib();
    const out = await submitWebBooking(body({ time: "13:00" }), NOW);
    expect(!out.ok && out.status).toBe(503);
    await setWebBookingSettings(before);
  });
});

describe("the desk answers", () => {
  it("confirming registers them once, books once, and texts once — however often it is pressed", async () => {
    const { setWebBookingSettings } = await import("@/lib/repos/company");
    await setWebBookingSettings({ accepting: true, confirmSmsOn: true, confirmSms: "" });

    const sent: { to: string; text: string }[] = [];
    const sender: SmsSender = async (to, text) => {
      sent.push({ to, text });
      return { ok: true, providerId: "1", credits: 1 };
    };

    const { getWebRequestByRequestId } = await repo();
    const req = (await getWebRequestByRequestId("req-first-0001"))!;
    const { confirmWebRequest } = await lib();
    const before = await patientCount();

    const input = {
      id: req.id,
      patientId: "new",
      dateBs: req.dateBs,
      timeHhmm: req.timeHhmm,
      durationMin: 15,
      userId: "u1",
    };
    const first = await confirmWebRequest(input, sender);
    const second = await confirmWebRequest(input, sender);

    expect(second.appointmentId).toBe(first.appointmentId);
    expect(await patientCount()).toBe(before + 1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("9800000001");
    expect(sent[0]!.text).toContain("Dear Sample Online, your appointment with Dr. Sample Karki");
    expect(sent[0]!.text).toContain("10:00 AM");
    expect(sent[0]!.text).toContain("Sample Clinic");
    expect(first.smsLine).toBe("The patient was sent a text.");

    const { getAppointment } = await import("@/lib/repos/appointments");
    const appt = (await getAppointment(first.appointmentId))!;
    expect(appt.source).toBe("web");
    expect(appt.status).toBe("booked");
    expect(appt.reason).toBe("Fever since Monday");

    const { getPatient } = await import("@/lib/repos/patients");
    const p = (await getPatient(first.patientId))!;
    expect(p.name).toBe("Sample Online");
    expect(p.phone).toBe("9800000001");
    expect(p.patientNo).not.toBeNull();

    const after = (await getWebRequestByRequestId("req-first-0001"))!;
    expect(after.status).toBe("confirmed");
    expect(after.smsStatus).toBe("sent");
  });

  it("can match somebody already on file instead, and move the time while doing it", async () => {
    const { submitWebBooking, confirmWebRequest } = await lib();
    const asked = await submitWebBooking(
      body({ time: "15:00" }, { name: "Sample Known", phone: "9800000009" }),
      NOW,
    );
    if (!asked.ok) throw new Error(asked.message);

    const { findPossibleDuplicates } = await import("@/lib/repos/patients");
    const matches = await findPossibleDuplicates(asked.request.name, asked.request.phone);
    expect(matches.map((m) => m.patient.id)).toContain("p_known");

    const before = await patientCount();
    const done = await confirmWebRequest(
      {
        id: asked.request.id,
        patientId: "p_known",
        dateBs: asked.request.dateBs,
        timeHhmm: "15:30",
        durationMin: 15,
        userId: "u1",
      },
      async () => ({ ok: true, providerId: null, credits: null }),
    );
    expect(done.patientId).toBe("p_known");
    expect(await patientCount()).toBe(before);

    const { getWebRequest } = await repo();
    const { publicView } = await lib();
    const view = publicView((await getWebRequest(asked.request.id))!);
    expect(view.status).toBe("confirmed");
    expect(view.time).toBe("15:30");
    expect(view.timeChanged).toBe(true);
    // what the website is shown never says who it is for
    expect(JSON.stringify(view)).not.toContain("Sample Known");
    expect(JSON.stringify(view)).not.toContain("9800000009");
  });

  it("with the text switched off, nothing is sent", async () => {
    const { setWebBookingSettings } = await import("@/lib/repos/company");
    await setWebBookingSettings({ accepting: true, confirmSmsOn: false, confirmSms: "" });
    const { submitWebBooking, confirmWebRequest } = await lib();
    const asked = await submitWebBooking(body({ time: "16:00" }, { phone: "9800000004" }), NOW);
    if (!asked.ok) throw new Error(asked.message);
    let calls = 0;
    const done = await confirmWebRequest(
      { id: asked.request.id, patientId: "new", dateBs: asked.request.dateBs, timeHhmm: "16:00", durationMin: 15, userId: "u1" },
      async () => {
        calls++;
        return { ok: true, providerId: null, credits: null };
      },
    );
    expect(calls).toBe(0);
    expect(done.smsLine).toBe("");
  });

  it("uses the owner's own wording, and records a text that did not go", async () => {
    const { setWebBookingSettings } = await import("@/lib/repos/company");
    await setWebBookingSettings({
      accepting: true,
      confirmSmsOn: true,
      confirmSms: "Hi {name}, {doctor} at {time}. Code {ref}.",
    });
    const { submitWebBooking, confirmWebRequest } = await lib();
    const asked = await submitWebBooking(body({ time: "16:30" }, { name: "Sample Own", phone: "9800000005" }), NOW);
    if (!asked.ok) throw new Error(asked.message);
    let text = "";
    const done = await confirmWebRequest(
      { id: asked.request.id, patientId: "new", dateBs: asked.request.dateBs, timeHhmm: "16:30", durationMin: 15, userId: "u1" },
      async (_to, t) => {
        text = t;
        return { ok: false, retry: true, detail: "The SMS account is out of credit." };
      },
    );
    expect(text).toBe(`Hi Sample Own, Dr. Sample Karki at 4:30 PM. Code ${asked.request.ref}.`);
    expect(done.smsLine).toContain("out of credit");
    const { getWebRequest } = await repo();
    const after = (await getWebRequest(asked.request.id))!;
    expect(after.status).toBe("confirmed");
    expect(after.smsStatus).toBe("failed");
  });

  it("declining gives the slot back, and a declined request cannot then be booked", async () => {
    const { submitWebBooking, declineWebRequest, confirmWebRequest, publicSlots, WebRequestError } = await lib();
    const asked = await submitWebBooking(body({ time: "17:00" }, { phone: "9800000006" }), NOW);
    if (!asked.ok) throw new Error(asked.message);

    let slots = await publicSlots("doc1", { date: DAY }, NOW);
    expect(slots.ok && slots.slots.map((s) => s.time)).not.toContain("17:00");

    await declineWebRequest(asked.request.id, "Doctor is away", "u1");
    slots = await publicSlots("doc1", { date: DAY }, NOW);
    expect(slots.ok && slots.slots.map((s) => s.time)).toContain("17:00");

    await expect(
      confirmWebRequest({ id: asked.request.id, patientId: "new", dateBs: asked.request.dateBs, timeHhmm: "17:00", durationMin: 15, userId: "u1" }),
    ).rejects.toBeInstanceOf(WebRequestError);
  });

  it("a request nobody answered expires when its time comes, and its slot goes back", async () => {
    const { submitWebBooking } = await lib();
    const asked = await submitWebBooking(body({ time: "18:00" }, { phone: "9800000008" }), NOW);
    if (!asked.ok) throw new Error(asked.message);

    const { countPendingWebRequests, expireStaleWebRequests, getWebRequest } = await repo();
    const atTheTime = new Date(Date.UTC(2030, 0, 11, 18, 0) - (5 * 60 + 45) * 60_000);
    const pendingBefore = await countPendingWebRequests(NOW);
    expect(await countPendingWebRequests(atTheTime)).toBeLessThan(pendingBefore);

    await expireStaleWebRequests(atTheTime);
    expect((await getWebRequest(asked.request.id))!.status).toBe("expired");
  });
});

describe("merging patients", () => {
  it("takes their bookings and website requests to the record that is kept", async () => {
    const { getWebRequestByRequestId } = await repo();
    const req = (await getWebRequestByRequestId("req-first-0001"))!;
    const { mergePatients } = await import("@/lib/repos/patients");
    await mergePatients("p_known", req.patientId!, "u1");

    const { getAppointment } = await import("@/lib/repos/appointments");
    expect((await getAppointment(req.appointmentId!))!.patientId).toBe("p_known");
    expect((await getWebRequestByRequestId("req-first-0001"))!.patientId).toBe("p_known");
  });
});
