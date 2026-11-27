/**
 * web-bookings.ts — consultations asked for on the clinic's website (0023).
 *
 * A request is not a booking and its person is not a patient. It holds its
 * slot while it waits; the front desk then confirms it (it becomes an
 * appointment, and the person is matched to a record or registered), declines
 * it, or lets its time go by, when it expires and the slot goes back.
 *
 * Requests are never deleted. One declined by mistake stays on the list with
 * its reason, like a cancelled booking (D-119).
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { ulid } from "ulid";
import { db, writeTransaction } from "@/lib/db";
import type { Row } from "@/lib/db";
import { overlaps } from "@/lib/appointment-types";
import { occupantsOn } from "@/lib/repos/appointments";
import { nepalClock, SLOT_MINUTES } from "@/lib/web-booking-slots";
import type { AgeUnit } from "@/lib/age";

export type WebRequestStatus = "pending" | "confirmed" | "declined" | "expired";
export type WebSmsStatus = "" | "sent" | "failed" | "off";

export interface WebBookingRequest {
  id: string;
  ref: string;
  requestId: string;
  doctorId: string;
  dateAd: string;
  dateBs: string;
  timeHhmm: string;
  durationMin: number;
  name: string;
  phone: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  address: string;
  reason: string;
  status: WebRequestStatus;
  declineReason: string;
  patientId: string | null;
  appointmentId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  smsStatus: WebSmsStatus;
  smsDetail: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebBookingRow extends WebBookingRequest {
  doctorName: string;
  reviewedByName: string | null;
  /** The booking it became, if it did — its time may differ from the asked one. */
  bookedDateAd: string | null;
  bookedDateBs: string | null;
  bookedTimeHhmm: string | null;
  bookedStatus: string | null;
  patientNo: number | null;
}

function mapRequest(r: Row): WebBookingRequest {
  const sex = r.sex as string;
  return {
    id: r.id as string,
    ref: r.ref as string,
    requestId: r.request_id as string,
    doctorId: r.doctor_id as string,
    dateAd: r.date_ad as string,
    dateBs: r.date_bs as string,
    timeHhmm: r.time_hhmm as string,
    durationMin: Number(r.duration_min),
    name: r.name as string,
    phone: r.phone as string,
    sex: sex === "f" || sex === "m" ? sex : "o",
    ageValue: r.age_value != null ? Number(r.age_value) : null,
    ageUnit: (r.age_unit as AgeUnit | null) ?? null,
    address: (r.address as string) ?? "",
    reason: (r.reason as string) ?? "",
    status: r.status as WebRequestStatus,
    declineReason: (r.decline_reason as string) ?? "",
    patientId: (r.patient_id as string | null) ?? null,
    appointmentId: (r.appointment_id as string | null) ?? null,
    reviewedBy: (r.reviewed_by as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    smsStatus: ((r.sms_status as string) ?? "") as WebSmsStatus,
    smsDetail: (r.sms_detail as string) ?? "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapRow(r: Row): WebBookingRow {
  return {
    ...mapRequest(r),
    doctorName: (r.doctor_name as string) ?? "",
    reviewedByName: (r.reviewed_by_name as string | null) ?? null,
    bookedDateAd: (r.booked_date_ad as string | null) ?? null,
    bookedDateBs: (r.booked_date_bs as string | null) ?? null,
    bookedTimeHhmm: (r.booked_time as string | null) ?? null,
    bookedStatus: (r.booked_status as string | null) ?? null,
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
  };
}

const FULL = `
  SELECT w.*,
         d.name AS doctor_name,
         u.name AS reviewed_by_name,
         a.date_ad AS booked_date_ad, a.date_bs AS booked_date_bs,
         a.time_hhmm AS booked_time, a.status AS booked_status,
         p.patient_no
    FROM web_booking_requests w
    JOIN doctors d ON d.id = w.doctor_id
    LEFT JOIN users u ON u.id = w.reviewed_by
    LEFT JOIN appointments a ON a.id = w.appointment_id
    LEFT JOIN patients p ON p.id = w.patient_id`;

/** The slot is gone. Says nothing about who has it: this reaches the public. */
export class SlotTakenError extends Error {
  readonly code = "slot_taken" as const;
  constructor() {
    super("slot taken");
    this.name = "SlotTakenError";
  }
}

// ---------------------------------------------------------------------------
// The booking code
// ---------------------------------------------------------------------------

/** Crockford's alphabet: no I, L, O or U, so it reads back over the phone. */
const REF_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** "W7K3Q9DX" — W for website, then seven random characters. */
export function newRef(): string {
  const bytes = randomBytes(7);
  let out = "W";
  for (const b of bytes) out += REF_ALPHABET[b % 32];
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getWebRequest(id: string): Promise<WebBookingRow | null> {
  const res = await db().execute({ sql: `${FULL} WHERE w.id = ?`, args: [id] });
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function getWebRequestByRef(ref: string): Promise<WebBookingRow | null> {
  const res = await db().execute({
    sql: `${FULL} WHERE w.ref = ?`,
    args: [ref.trim().toUpperCase()],
  });
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function getWebRequestByRequestId(
  requestId: string,
): Promise<WebBookingRow | null> {
  const res = await db().execute({
    sql: `${FULL} WHERE w.request_id = ?`,
    args: [requestId],
  });
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/** Waiting for the desk, soonest first — the order they need answering in. */
export async function pendingWebRequests(): Promise<WebBookingRow[]> {
  const res = await db().execute(
    `${FULL} WHERE w.status = 'pending' ORDER BY w.date_ad ASC, w.time_hhmm ASC`,
  );
  return res.rows.map(mapRow);
}

/** Everything already answered (or let go), most recent first. */
export async function answeredWebRequests(limit = 100): Promise<WebBookingRow[]> {
  const res = await db().execute({
    sql: `${FULL} WHERE w.status != 'pending'
          ORDER BY w.updated_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(mapRow);
}

/**
 * The number on the Requests tab. A plain read — the menu asks every minute
 * from every open screen — so a request whose time has gone by is left out
 * here rather than written off; the Requests page does that.
 */
export async function countPendingWebRequests(now: Date = new Date()): Promise<number> {
  const { dateAd, minutes } = nepalClock(now);
  const res = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM web_booking_requests
           WHERE status = 'pending'
             AND (date_ad > ? OR (date_ad = ? AND time_hhmm > ?))`,
    args: [dateAd, dateAd, hhmmOfMinutes(minutes)],
  });
  return Number(res.rows[0]?.n ?? 0);
}

function hhmmOfMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Requests from one number still waiting — a person asks for a few, not dozens. */
export async function pendingForPhone(phone: string): Promise<number> {
  const res = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM web_booking_requests
           WHERE phone = ? AND status = 'pending'`,
    args: [phone],
  });
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * The slots one doctor has taken or held on one day, as the website's slot
 * list must see them. Who holds them is not returned.
 */
export async function takenOn(
  doctorId: string,
  dateAd: string,
  now: Date = new Date(),
): Promise<{ timeHhmm: string; durationMin: number }[]> {
  const all = await occupantsOn(db(), doctorId, dateAd, {}, now);
  return all.map(({ timeHhmm, durationMin }) => ({ timeHhmm, durationMin }));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Nobody answered before the time came: the request expires and its slot goes
 * back. Run whenever the list or its count is read, so nothing needs a
 * schedule of its own.
 */
export async function expireStaleWebRequests(now: Date = new Date()): Promise<number> {
  const { dateAd, minutes } = nepalClock(now);
  const hhmm = hhmmOfMinutes(minutes);
  const res = await db().execute({
    sql: `UPDATE web_booking_requests
             SET status = 'expired', updated_at = ?
           WHERE status = 'pending'
             AND (date_ad < ? OR (date_ad = ? AND time_hhmm <= ?))`,
    args: [now.toISOString(), dateAd, dateAd, hhmm],
  });
  return res.rowsAffected;
}

export interface NewWebRequestInput {
  requestId: string;
  doctorId: string;
  dateAd: string;
  dateBs: string;
  timeHhmm: string;
  name: string;
  phone: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  address: string;
  reason: string;
}

/**
 * Record what somebody asked for on the website.
 *
 * Idempotent on the website's `requestId`: the same submission sent twice is
 * one request, and the second call gets the first one back (`existing`).
 *
 * The clash check and the insert are one write transaction, so two people
 * pressing Book on the same slot in the same second get one request between
 * them, and the other is told the time has gone.
 */
export async function createWebRequest(
  input: NewWebRequestInput,
  now: Date = new Date(),
): Promise<{ request: WebBookingRow; existing: boolean }> {
  const before = await getWebRequestByRequestId(input.requestId);
  if (before) return { request: before, existing: true };

  const id = ulid();
  const stamp = now.toISOString();
  try {
    await writeTransaction(async (tx) => {
      const occupants = await occupantsOn(tx, input.doctorId, input.dateAd, {}, now);
      const clash = occupants.some((o) =>
        overlaps(o, { timeHhmm: input.timeHhmm, durationMin: SLOT_MINUTES }),
      );
      if (clash) throw new SlotTakenError();

      // A clash on the seven random characters is a one-in-34-billion event;
      // try again rather than fail somebody's booking over it.
      let ref = newRef();
      for (let i = 0; i < 5; i++) {
        const seen = await tx.execute({
          sql: "SELECT 1 FROM web_booking_requests WHERE ref = ?",
          args: [ref],
        });
        if (seen.rows.length === 0) break;
        ref = newRef();
      }

      await tx.execute({
        sql: `INSERT INTO web_booking_requests
                (id, ref, request_id, doctor_id, date_ad, date_bs, time_hhmm,
                 duration_min, name, phone, sex, age_value, age_unit, address,
                 reason, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        args: [
          id,
          ref,
          input.requestId,
          input.doctorId,
          input.dateAd,
          input.dateBs,
          input.timeHhmm,
          SLOT_MINUTES,
          input.name,
          input.phone,
          input.sex,
          input.ageValue,
          input.ageUnit,
          input.address,
          input.reason,
          stamp,
          stamp,
        ],
      });
    });
  } catch (err) {
    // The same submission racing itself: the other copy won, so this is it.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      const won = await getWebRequestByRequestId(input.requestId);
      if (won) return { request: won, existing: true };
    }
    throw err;
  }

  const made = await getWebRequest(id);
  if (!made) throw new Error("web request did not save");
  return { request: made, existing: false };
}

/**
 * The front desk said yes. Conditional on it still waiting, so two people
 * confirming at once write it once. Returns false when it was not waiting.
 */
export async function markWebRequestConfirmed(
  id: string,
  done: { patientId: string; appointmentId: string; userId: string },
): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db().execute({
    sql: `UPDATE web_booking_requests
             SET status = 'confirmed', patient_id = ?, appointment_id = ?,
                 reviewed_by = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('pending', 'expired')`,
    args: [done.patientId, done.appointmentId, done.userId, now, now, id],
  });
  return res.rowsAffected > 0;
}

/** The front desk said no. Conditional on it still waiting. */
export async function markWebRequestDeclined(
  id: string,
  reason: string,
  userId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db().execute({
    sql: `UPDATE web_booking_requests
             SET status = 'declined', decline_reason = ?,
                 reviewed_by = ?, reviewed_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('pending', 'expired')`,
    args: [reason, userId, now, now, id],
  });
  return res.rowsAffected > 0;
}

/** What came of the confirmation text. */
export async function recordConfirmSms(
  id: string,
  status: Exclude<WebSmsStatus, "">,
  detail: string,
): Promise<void> {
  await db().execute({
    sql: `UPDATE web_booking_requests
             SET sms_status = ?, sms_detail = ?, updated_at = ?
           WHERE id = ?`,
    args: [status, detail, new Date().toISOString(), id],
  });
}
