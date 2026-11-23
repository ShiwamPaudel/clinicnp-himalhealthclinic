-- 0022_sms_reminders.sql — a text message to a patient on the same Nepali
-- day every month, until somebody stops it (C-028).
--
-- Append-only: never edit once applied.
--
-- Additive only. Two new tables and one new column on `company`, which
-- defaults to empty. No table is rebuilt and no existing value changes.
--
-- A reminder remembers the day of the month it was set for (`day_of_month`)
-- as well as the next date it goes out. Nepali months run from 29 to 32
-- days, so a reminder set for the 32nd goes out on the last day of a shorter
-- month and comes back to the 32nd when a month has one. Keeping only the
-- next date would lose that the first time a short month went by.
--
-- The phone number is kept on the reminder rather than read from the patient
-- each month: it is the number somebody checked at the desk when the
-- reminder was set, and a later edit to the patient's details must not send
-- a reminder to a number nobody chose for it.
--
-- No CHECK on any status column, for the reason written into 0013, 0015 and
-- 0016: this project has twice rebuilt a table to widen one.

-- ============================================================
-- company: the message every reminder sends unless it has its own.
-- Empty means the wording built into the software is used.
-- ============================================================
ALTER TABLE company ADD COLUMN sms_message TEXT NOT NULL DEFAULT '';

-- ============================================================
-- sms_reminders — who gets a message, on which day, at what number
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_reminders (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  phone         TEXT NOT NULL,
  -- the Nepali day of the month it was set for, 1 to 32
  day_of_month  INTEGER NOT NULL,
  -- the next day it goes out, both calendars (Rules 1.5)
  next_date_bs  TEXT NOT NULL,
  next_date_ad  TEXT NOT NULL,
  -- its own wording; empty means the shared message on company
  message       TEXT NOT NULL DEFAULT '',
  -- active | stopped
  status        TEXT NOT NULL DEFAULT 'active',
  stopped_at    TEXT,
  stopped_by    TEXT REFERENCES users(id),
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_reminders_due
  ON sms_reminders (status, next_date_ad);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_patient
  ON sms_reminders (patient_id);

-- ============================================================
-- sms_sent — every message that went out, or tried to
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_sent (
  id            TEXT PRIMARY KEY,
  -- NULL for a test message typed in by the owner
  reminder_id   TEXT REFERENCES sms_reminders(id),
  -- which month's reminder this was, in BS
  due_date_bs   TEXT,
  phone         TEXT NOT NULL,
  message       TEXT NOT NULL,
  -- sending | sent | failed | missed
  status        TEXT NOT NULL,
  -- what went wrong, in words written for the screen
  detail        TEXT NOT NULL DEFAULT '',
  -- the SMS service's own number for the message, and what it cost
  provider_id   TEXT,
  credits       INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 1,
  -- 1 when a failure could go through on the next run (no connection, no
  -- credit), 0 when it never will (the number was refused)
  can_retry     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One message per reminder per month. This is what stops a run that is
-- started twice, or retried, from sending somebody the same reminder twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_sent_once
  ON sms_sent (reminder_id, due_date_bs) WHERE reminder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_sent_recent
  ON sms_sent (created_at DESC);
