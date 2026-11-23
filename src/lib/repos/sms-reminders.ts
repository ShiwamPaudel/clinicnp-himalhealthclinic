/**
 * sms-reminders.ts — monthly text-message reminders, and every message sent.
 *
 * A reminder is never deleted. Stopping one keeps it, with who stopped it and
 * when, so "nobody set one up" and "somebody stopped it" never look the same.
 *
 * Sending is made safe against running twice by `sms_sent`'s unique index on
 * (reminder, month): a message is claimed by writing its row *before* the SMS
 * service is called, and only the run that wrote the row sends it.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { DEFAULT_SMS_MESSAGE } from "@/lib/sms-text";

export type ReminderStatus = "active" | "stopped";
export type SentStatus = "sending" | "sent" | "failed" | "missed";

export interface SmsReminder {
  id: string;
  patientId: string;
  phone: string;
  dayOfMonth: number;
  nextDateBs: string;
  nextDateAd: string;
  /** Its own wording; empty means the shared message. */
  message: string;
  status: ReminderStatus;
  stoppedAt: string | null;
  stoppedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsReminderRow extends SmsReminder {
  patientName: string;
  patientNo: number | null;
  stoppedByName: string;
  lastStatus: SentStatus | null;
  lastDetail: string;
  lastDueBs: string | null;
  lastAt: string | null;
}

export interface SmsSentRow {
  id: string;
  reminderId: string | null;
  dueDateBs: string | null;
  phone: string;
  message: string;
  status: SentStatus;
  detail: string;
  credits: number | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  patientId: string | null;
  patientName: string;
  patientNo: number | null;
}

function mapReminder(r: Row): SmsReminder {
  return {
    id: r.id as string,
    patientId: r.patient_id as string,
    phone: r.phone as string,
    dayOfMonth: Number(r.day_of_month),
    nextDateBs: r.next_date_bs as string,
    nextDateAd: r.next_date_ad as string,
    message: (r.message as string) ?? "",
    status: r.status as ReminderStatus,
    stoppedAt: (r.stopped_at as string | null) ?? null,
    stoppedBy: (r.stopped_by as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapReminderRow(r: Row): SmsReminderRow {
  return {
    ...mapReminder(r),
    patientName: (r.patient_name as string) ?? "",
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
    stoppedByName: (r.stopped_by_name as string) ?? "",
    lastStatus: (r.last_status as SentStatus | null) ?? null,
    lastDetail: (r.last_detail as string) ?? "",
    lastDueBs: (r.last_due_bs as string | null) ?? null,
    lastAt: (r.last_at as string | null) ?? null,
  };
}

function mapSent(r: Row): SmsSentRow {
  return {
    id: r.id as string,
    reminderId: (r.reminder_id as string | null) ?? null,
    dueDateBs: (r.due_date_bs as string | null) ?? null,
    phone: r.phone as string,
    message: r.message as string,
    status: r.status as SentStatus,
    detail: (r.detail as string) ?? "",
    credits: r.credits != null ? Number(r.credits) : null,
    attempts: Number(r.attempts ?? 1),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    patientId: (r.patient_id as string | null) ?? null,
    patientName: (r.patient_name as string) ?? "",
    patientNo: r.patient_no != null ? Number(r.patient_no) : null,
  };
}

/**
 * Each reminder with its patient and the last thing that happened to it.
 * The latest message is picked by `rowid`, not by id or time: ids minted in
 * the same millisecond can sort backwards (D-046).
 */
const FULL = `
  SELECT r.*,
         p.name AS patient_name, p.patient_no,
         u.name AS stopped_by_name,
         s.status AS last_status, s.detail AS last_detail,
         s.due_date_bs AS last_due_bs, s.updated_at AS last_at
    FROM sms_reminders r
    JOIN patients p ON p.id = r.patient_id
    LEFT JOIN users u ON u.id = r.stopped_by
    LEFT JOIN sms_sent s ON s.rowid = (
      SELECT s2.rowid FROM sms_sent s2
       WHERE s2.reminder_id = r.id
       ORDER BY s2.rowid DESC LIMIT 1
    )`;

// ---------------------------------------------------------------------------
// The shared message
// ---------------------------------------------------------------------------

/** What the clinic wrote, or "" when it has not written anything. */
export async function getStoredSharedMessage(): Promise<string> {
  const res = await db().execute("SELECT sms_message FROM company WHERE id = 1");
  return ((res.rows[0]?.sms_message as string | undefined) ?? "").trim();
}

/** The message a reminder with no wording of its own actually sends. */
export async function getSharedMessage(): Promise<string> {
  return (await getStoredSharedMessage()) || DEFAULT_SMS_MESSAGE;
}

/** Empty text puts the built-in wording back. */
export async function setSharedMessage(text: string): Promise<void> {
  const res = await db().execute({
    sql: "UPDATE company SET sms_message = ? WHERE id = 1",
    args: [text.trim()],
  });
  if (res.rowsAffected !== 1) throw new Error("company row missing");
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface NewReminderInput {
  /** Minted by the browser, so a retry sets up one reminder and not two. */
  id?: string;
  patientId: string;
  phone: string;
  dayOfMonth: number;
  nextDateBs: string;
  nextDateAd: string;
  message: string;
  createdBy: string;
}

/**
 * Set up a reminder. Idempotent on the id.
 *
 * When the patient has no phone number on file, the number typed here is
 * written to their details as well (owner's choice, C-028) — but only into an
 * empty box, in the same write: a number already on file is never replaced.
 */
export async function createReminder(
  input: NewReminderInput,
): Promise<{ reminder: SmsReminder; phoneSavedToPatient: boolean }> {
  const id = input.id ?? ulid();
  const existing = await getReminder(id);
  if (existing) return { reminder: existing, phoneSavedToPatient: false };

  const now = new Date().toISOString();
  const [, phoneRes] = await db().batch(
    [
      {
        sql: `INSERT INTO sms_reminders
                (id, patient_id, phone, day_of_month, next_date_bs, next_date_ad,
                 message, status, stopped_at, stopped_by, created_by,
                 created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?, ?)`,
        args: [
          id,
          input.patientId,
          input.phone,
          input.dayOfMonth,
          input.nextDateBs,
          input.nextDateAd,
          input.message,
          input.createdBy,
          now,
          now,
        ],
      },
      {
        sql: `UPDATE patients SET phone = ?, updated_at = ?
               WHERE id = ? AND TRIM(phone) = ''`,
        args: [input.phone, now, input.patientId],
      },
    ],
    "write",
  );

  const made = await getReminder(id);
  if (!made) throw new Error("reminder did not save");
  return { reminder: made, phoneSavedToPatient: (phoneRes?.rowsAffected ?? 0) === 1 };
}

export async function getReminder(id: string): Promise<SmsReminder | null> {
  const res = await db().execute({
    sql: "SELECT * FROM sms_reminders WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapReminder(res.rows[0]) : null;
}

export async function getReminderRow(id: string): Promise<SmsReminderRow | null> {
  const res = await db().execute({ sql: `${FULL} WHERE r.id = ?`, args: [id] });
  return res.rows[0] ? mapReminderRow(res.rows[0]) : null;
}

/** Active ones by the date they next go out; stopped ones most recent first. */
export async function listReminders(status: ReminderStatus): Promise<SmsReminderRow[]> {
  const order =
    status === "active"
      ? "r.next_date_ad ASC, p.name ASC"
      : "r.stopped_at DESC, p.name ASC";
  const res = await db().execute({
    sql: `${FULL} WHERE r.status = ? ORDER BY ${order}`,
    args: [status],
  });
  return res.rows.map(mapReminderRow);
}

export async function reminderCounts(): Promise<Record<ReminderStatus, number>> {
  const res = await db().execute(
    "SELECT status, COUNT(*) AS n FROM sms_reminders GROUP BY status",
  );
  const out: Record<ReminderStatus, number> = { active: 0, stopped: 0 };
  for (const r of res.rows) {
    const s = r.status as ReminderStatus;
    if (s === "active" || s === "stopped") out[s] = Number(r.n);
  }
  return out;
}

export interface ReminderChange {
  phone: string;
  message: string;
  dayOfMonth: number;
  nextDateBs: string;
  nextDateAd: string;
}

/** Change a reminder that is still running. A stopped one stays as it was. */
export async function updateReminder(id: string, next: ReminderChange): Promise<boolean> {
  const res = await db().execute({
    sql: `UPDATE sms_reminders
             SET phone = ?, message = ?, day_of_month = ?, next_date_bs = ?,
                 next_date_ad = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`,
    args: [
      next.phone,
      next.message,
      next.dayOfMonth,
      next.nextDateBs,
      next.nextDateAd,
      new Date().toISOString(),
      id,
    ],
  });
  return res.rowsAffected === 1;
}

/** Stop it for good. Returns false if it was already stopped. */
export async function stopReminder(id: string, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db().execute({
    sql: `UPDATE sms_reminders
             SET status = 'stopped', stopped_at = ?, stopped_by = ?, updated_at = ?
           WHERE id = ? AND status = 'active'`,
    args: [now, userId, now, id],
  });
  return res.rowsAffected === 1;
}

// ---------------------------------------------------------------------------
// The morning run
// ---------------------------------------------------------------------------

export interface DueReminder extends SmsReminder {
  patientName: string;
}

/** Running reminders whose next date is today or earlier (AD text). */
export async function remindersDueBy(todayAd: string): Promise<DueReminder[]> {
  const res = await db().execute({
    sql: `SELECT r.*, p.name AS patient_name
            FROM sms_reminders r
            JOIN patients p ON p.id = r.patient_id
           WHERE r.status = 'active' AND r.next_date_ad <= ?
           ORDER BY r.next_date_ad ASC, r.rowid ASC`,
    args: [todayAd],
  });
  return res.rows.map((r) => ({
    ...mapReminder(r),
    patientName: (r.patient_name as string) ?? "",
  }));
}

/**
 * Move a reminder on to its next date. Only moves it from the date the run
 * saw, so two runs at once can never skip a month between them.
 */
export async function advanceReminder(
  id: string,
  fromBs: string,
  nextBs: string,
  nextAd: string,
): Promise<boolean> {
  const res = await db().execute({
    sql: `UPDATE sms_reminders
             SET next_date_bs = ?, next_date_ad = ?, updated_at = ?
           WHERE id = ? AND next_date_bs = ? AND status = 'active'`,
    args: [nextBs, nextAd, new Date().toISOString(), id, fromBs],
  });
  return res.rowsAffected === 1;
}

/**
 * Claim one month's message for sending. Returns the row id when this run
 * may send it, or null when it is already sent, being sent, recorded as
 * missed, or failed in a way that will not come right.
 */
export async function claimSend(
  reminderId: string,
  dueBs: string,
  phone: string,
  message: string,
): Promise<string | null> {
  const now = new Date().toISOString();
  const id = ulid();
  const inserted = await db().execute({
    sql: `INSERT INTO sms_sent
            (id, reminder_id, due_date_bs, phone, message, status, detail,
             provider_id, credits, attempts, can_retry, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'sending', '', NULL, NULL, 1, 0, ?, ?)
          ON CONFLICT DO NOTHING`,
    args: [id, reminderId, dueBs, phone, message, now, now],
  });
  if (inserted.rowsAffected === 1) return id;

  // Already a row for this month. Only a failure that could come right is
  // tried again, and the conditional update means only one run gets it.
  const retried = await db().execute({
    sql: `UPDATE sms_sent
             SET status = 'sending', attempts = attempts + 1, phone = ?,
                 message = ?, detail = '', updated_at = ?
           WHERE reminder_id = ? AND due_date_bs = ?
             AND status = 'failed' AND can_retry = 1
          RETURNING id`,
    args: [phone, message, now, reminderId, dueBs],
  });
  return retried.rows[0] ? (retried.rows[0].id as string) : null;
}

export async function markSent(
  sentId: string,
  providerId: string | null,
  credits: number | null,
): Promise<void> {
  await db().execute({
    sql: `UPDATE sms_sent
             SET status = 'sent', detail = '', provider_id = ?, credits = ?,
                 can_retry = 0, updated_at = ?
           WHERE id = ?`,
    args: [providerId, credits, new Date().toISOString(), sentId],
  });
}

export async function markFailed(
  sentId: string,
  detail: string,
  canRetry: boolean,
): Promise<void> {
  await db().execute({
    sql: `UPDATE sms_sent
             SET status = 'failed', detail = ?, can_retry = ?, updated_at = ?
           WHERE id = ?`,
    args: [detail, canRetry ? 1 : 0, new Date().toISOString(), sentId],
  });
}

/**
 * Write down a month whose message never went, so the screen can say so. A
 * month that already has a row (a failure, say) keeps the row it has, but it
 * can no longer be retried: its day has passed.
 */
export async function recordMissed(
  reminderId: string,
  dueBs: string,
  phone: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().batch(
    [
      {
        sql: `INSERT INTO sms_sent
                (id, reminder_id, due_date_bs, phone, message, status, detail,
                 provider_id, credits, attempts, can_retry, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'missed', ?, NULL, NULL, 0, 0, ?, ?)
              ON CONFLICT DO NOTHING`,
        args: [
          ulid(),
          reminderId,
          dueBs,
          phone,
          message,
          "Not sent on its day.",
          now,
          now,
        ],
      },
      {
        sql: `UPDATE sms_sent SET can_retry = 0, updated_at = ?
               WHERE reminder_id = ? AND due_date_bs = ? AND can_retry = 1`,
        args: [now, reminderId, dueBs],
      },
    ],
    "write",
  );
}

/** A test message the owner sent to check the SMS service works. */
export async function recordTestSend(
  phone: string,
  message: string,
  outcome:
    | { ok: true; providerId: string | null; credits: number | null }
    | { ok: false; detail: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO sms_sent
            (id, reminder_id, due_date_bs, phone, message, status, detail,
             provider_id, credits, attempts, can_retry, created_at, updated_at)
          VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    args: [
      ulid(),
      phone,
      message,
      outcome.ok ? "sent" : "failed",
      outcome.ok ? "" : outcome.detail,
      outcome.ok ? outcome.providerId : null,
      outcome.ok ? outcome.credits : null,
      now,
      now,
    ],
  });
}

/** The most recent messages, newest first. */
export async function recentSent(limit = 200): Promise<SmsSentRow[]> {
  const res = await db().execute({
    sql: `SELECT s.*, r.patient_id, p.name AS patient_name, p.patient_no
            FROM sms_sent s
            LEFT JOIN sms_reminders r ON r.id = s.reminder_id
            LEFT JOIN patients p ON p.id = r.patient_id
           ORDER BY s.updated_at DESC, s.rowid DESC
           LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(mapSent);
}

/** The messages one reminder has sent, newest first. */
export async function sentForReminder(reminderId: string, limit = 24): Promise<SmsSentRow[]> {
  const res = await db().execute({
    sql: `SELECT s.*, r.patient_id, p.name AS patient_name, p.patient_no
            FROM sms_sent s
            JOIN sms_reminders r ON r.id = s.reminder_id
            JOIN patients p ON p.id = r.patient_id
           WHERE s.reminder_id = ?
           ORDER BY s.rowid DESC
           LIMIT ?`,
    args: [reminderId, limit],
  });
  return res.rows.map(mapSent);
}
