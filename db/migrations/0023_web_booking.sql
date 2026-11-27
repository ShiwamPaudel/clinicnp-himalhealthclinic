-- 0023_web_booking.sql — consultations asked for on the clinic's website,
-- waiting for the front desk to confirm them (C-029).
--
-- Append-only: never edit once applied.
--
-- Additive only. One new table, three new columns on `company` and one on
-- `appointments`, all with defaults. No table is rebuilt and no existing value
-- changes.
--
-- A website request is not a booking. Somebody on the website said "I would
-- like Thursday at 2 with Dr Karki"; nobody at the clinic has agreed to it yet.
-- So it does not go into `appointments` (whose patient must be a real record)
-- and it does not register a patient: a form anybody can fill in must not hand
-- out lifetime patient numbers, which are never reused (D-028). The front desk
-- confirms it — matching the person to a record already on file, or
-- registering them — and only then does it become an appointment.
--
-- While it waits, it holds its time: nobody else, on the website or at the
-- desk, can be put into that slot with that doctor.
--
-- No CHECK on any status column, for the reason written into 0013, 0015 and
-- 0016: this project has twice rebuilt a table to widen one.

-- ============================================================
-- company: the switches on Settings → Online booking
-- ============================================================
-- 1 = the website may send requests; 0 = it is told bookings are paused.
ALTER TABLE company ADD COLUMN web_booking_on INTEGER NOT NULL DEFAULT 1;
-- 1 = text the patient when the front desk confirms their request.
ALTER TABLE company ADD COLUMN web_confirm_sms_on INTEGER NOT NULL DEFAULT 0;
-- The confirmation message. Empty means the wording built into the software.
ALTER TABLE company ADD COLUMN web_confirm_sms TEXT NOT NULL DEFAULT '';

-- ============================================================
-- appointments: where a booking came from. desk | web
-- ============================================================
ALTER TABLE appointments ADD COLUMN source TEXT NOT NULL DEFAULT 'desk';

-- ============================================================
-- web_booking_requests — what somebody asked for on the website
-- ============================================================
CREATE TABLE IF NOT EXISTS web_booking_requests (
  id              TEXT PRIMARY KEY,
  -- the short code the person is shown, and quotes if they phone
  ref             TEXT NOT NULL UNIQUE,
  -- the website's own id for this submission, so a retry is one request
  request_id      TEXT NOT NULL UNIQUE,
  doctor_id       TEXT NOT NULL REFERENCES doctors(id),
  -- what they asked for, both calendars (Rules 1.15)
  date_ad         TEXT NOT NULL,
  date_bs         TEXT NOT NULL,
  time_hhmm       TEXT NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 15,
  -- who they said they are. Not a patient record until somebody confirms.
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  sex             TEXT NOT NULL,
  age_value       INTEGER,
  age_unit        TEXT,
  address         TEXT NOT NULL DEFAULT '',
  reason          TEXT NOT NULL DEFAULT '',
  -- pending | confirmed | declined | expired
  status          TEXT NOT NULL DEFAULT 'pending',
  decline_reason  TEXT NOT NULL DEFAULT '',
  -- set when it was confirmed: the record it was matched to or registered as,
  -- and the booking it became
  patient_id      TEXT REFERENCES patients(id),
  appointment_id  TEXT REFERENCES appointments(id),
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  -- the confirmation text: '' (none tried) | sent | failed | off
  sms_status      TEXT NOT NULL DEFAULT '',
  sms_detail      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_requests_status
  ON web_booking_requests (status, date_ad, time_hhmm);
CREATE INDEX IF NOT EXISTS idx_web_requests_doctor_day
  ON web_booking_requests (doctor_id, date_ad);
CREATE INDEX IF NOT EXISTS idx_web_requests_phone
  ON web_booking_requests (phone, created_at);
