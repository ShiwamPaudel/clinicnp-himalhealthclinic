/**
 * web-booking.ts — what happens to a consultation asked for on the website.
 * Server only.
 *
 *   website ──► submitWebBooking ──► a request, holding its slot
 *   desk    ──► confirmWebRequest ──► a patient (matched or registered),
 *                                     an appointment, the doctor told,
 *                                     and — if switched on — a text to the patient
 *   desk    ──► declineWebRequest ──► the slot goes back
 *
 * No sign-in checks here: the public route checks the website's key and the
 * desk actions check the person. That keeps this testable on its own, with the
 * SMS sender passed in.
 */
import "server-only";
import { getDoctor, listDoctors } from "@/lib/repos/doctors";
import { createPatient, getPatient } from "@/lib/repos/patients";
import { createAppointment } from "@/lib/repos/appointments";
import { getCompany, getWebBookingSettings } from "@/lib/repos/company";
import { recordAudit } from "@/lib/repos/audit";
import {
  createWebRequest,
  getWebRequest,
  getWebRequestByRequestId,
  markWebRequestConfirmed,
  markWebRequestDeclined,
  pendingForPhone,
  recordConfirmSms,
  SlotTakenError,
  takenOn,
  type WebBookingRow,
} from "@/lib/repos/web-bookings";
import { publicBookingSchema } from "@/lib/validators";
import {
  freeSlots,
  slotProblem,
  isIsoDate,
  firstOfferable,
  lastBookableDay,
  SLOT_PROBLEM_MESSAGE,
  OPENS_AT,
  CLOSES_AT,
  SLOT_MINUTES,
  LEAD_HOURS,
  HORIZON_DAYS,
} from "@/lib/web-booking-slots";
import {
  DEFAULT_CONFIRM_SMS,
  fillConfirmMessage,
  shortAd,
} from "@/lib/web-booking-text";
import { mobileProblem, normalizeMobile, isNepaliMobile } from "@/lib/sms-text";
import { sendSms, NOT_SET_UP, type SmsSender } from "@/lib/sms";
import { longBs } from "@/lib/sms-schedule";
import { formatTime } from "@/lib/appointment-types";
import { isSaneAge } from "@/lib/age";
import { adFromIso, adToIso, bsFromDbText, bsToDbText, toAD, toBS } from "@/lib/bs";

/** How many requests one mobile number may have waiting at once. */
export const MAX_PENDING_PER_PHONE = 3;

// ---------------------------------------------------------------------------
// Dates: the website speaks AD, the clinic stores BS as well (Rules §1.15)
// ---------------------------------------------------------------------------

export function adToBsText(dateAd: string): string {
  return bsToDbText(toBS(adFromIso(dateAd)));
}

export function bsTextToAd(dateBs: string): string {
  return adToIso(toAD(bsFromDbText(dateBs)));
}

/** A BS date the converter can read, or null. */
function safeBsToAd(dateBs: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateBs)) return null;
  try {
    const ad = bsTextToAd(dateBs);
    return isIsoDate(ad) && adToBsText(ad) === dateBs ? ad : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What the website may read
// ---------------------------------------------------------------------------

export interface PublicDoctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
}

/** Every doctor seeing patients (owner's choice, C-029). Nothing private. */
export async function publicDoctors(): Promise<PublicDoctor[]> {
  const all = await listDoctors(false);
  return all.map((d) => ({
    id: d.id,
    name: d.name,
    qualification: d.qualification,
    specialty: d.specialty,
  }));
}

/** The rules the website's date and time pickers should follow. */
export function bookingWindow(now: Date = new Date()) {
  const first = firstOfferable(now);
  const last = lastBookableDay(now);
  return {
    opensAt: OPENS_AT,
    closesAt: CLOSES_AT,
    slotMinutes: SLOT_MINUTES,
    leadHours: LEAD_HOURS,
    horizonDays: HORIZON_DAYS,
    earliest: { date: first.dateAd, dateBs: adToBsText(first.dateAd), time: first.timeHhmm },
    lastDate: { date: last, dateBs: adToBsText(last) },
    timeZone: "Asia/Kathmandu",
  };
}

export type SlotsAnswer =
  | {
      ok: true;
      date: string;
      dateBs: string;
      slots: { time: string; label: string }[];
    }
  | { ok: false; status: number; code: string; message: string };

export async function publicSlots(
  doctorId: string,
  query: { date?: string | null; dateBs?: string | null },
  now: Date = new Date(),
): Promise<SlotsAnswer> {
  const doctor = await getDoctor(doctorId);
  if (!doctor || !doctor.active) {
    return { ok: false, status: 404, code: "doctor_not_found", message: "That doctor is not taking bookings." };
  }

  let dateAd: string | null = null;
  if (query.date) dateAd = isIsoDate(query.date) ? query.date : null;
  else if (query.dateBs) dateAd = safeBsToAd(query.dateBs);
  if (!dateAd) {
    return { ok: false, status: 400, code: "bad_date", message: "Send date as YYYY-MM-DD (or dateBs)." };
  }

  const taken = await takenOn(doctor.id, dateAd, now);
  const slots = freeSlots(dateAd, now, taken).map((t) => ({
    time: t,
    label: formatTime(t),
  }));
  return { ok: true, date: dateAd, dateBs: adToBsText(dateAd), slots };
}

/** What the website is shown about one request — never who it is for. */
export function publicView(r: WebBookingRow) {
  const confirmed = r.status === "confirmed" && r.bookedDateAd && r.bookedTimeHhmm;
  const dateAd = confirmed ? r.bookedDateAd! : r.dateAd;
  const dateBs = confirmed ? (r.bookedDateBs ?? r.dateBs) : r.dateBs;
  const time = confirmed ? r.bookedTimeHhmm! : r.timeHhmm;
  return {
    ref: r.ref,
    status: r.status,
    doctor: { id: r.doctorId, name: r.doctorName },
    date: dateAd,
    dateBs,
    time,
    timeLabel: formatTime(time),
    /** True when the clinic confirmed a different time from the one asked for. */
    timeChanged: Boolean(confirmed && (dateAd !== r.dateAd || time !== r.timeHhmm)),
    requestedAt: r.createdAt,
  };
}

// ---------------------------------------------------------------------------
// The website asks
// ---------------------------------------------------------------------------

export type SubmitAnswer =
  | { ok: true; existing: boolean; request: WebBookingRow }
  | { ok: false; status: number; code: string; message: string; field?: string };

function no(status: number, code: string, message: string, field?: string): SubmitAnswer {
  return { ok: false, status, code, message, field };
}

export async function submitWebBooking(
  raw: unknown,
  now: Date = new Date(),
): Promise<SubmitAnswer> {
  const parsed = publicBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return no(400, "invalid", issue?.message ?? "Please check the details.", issue?.path.join("."));
  }
  const b = parsed.data;

  const settings = await getWebBookingSettings();
  if (!settings.accepting) {
    return no(503, "not_accepting", "Online booking is paused just now. Please phone the clinic.");
  }

  const doctor = await getDoctor(b.doctorId);
  if (!doctor || !doctor.active) {
    return no(404, "doctor_not_found", "That doctor is not taking bookings.", "doctorId");
  }

  const dateAd = b.date ? (isIsoDate(b.date) ? b.date : null) : safeBsToAd(b.dateBs ?? "");
  if (!dateAd) return no(400, "bad_date", SLOT_PROBLEM_MESSAGE.bad_date, b.date ? "date" : "dateBs");

  const problem = slotProblem(dateAd, b.time, now);
  if (problem) {
    return no(422, problem, SLOT_PROBLEM_MESSAGE[problem], problem === "bad_date" ? "date" : "time");
  }

  const phoneProblem = mobileProblem(b.patient.phone);
  if (phoneProblem) {
    return no(400, "bad_phone", "Enter a 10-digit mobile number starting with 9.", "patient.phone");
  }
  const phone = normalizeMobile(b.patient.phone);

  const age = b.patient.age ?? null;
  if (age && !isSaneAge(age.value, age.unit)) {
    return no(400, "bad_age", "Check the age.", "patient.age");
  }

  // The same submission again is answered before any limit is applied to it.
  const already = await getWebRequestByRequestId(b.requestId);
  if (already) return { ok: true, existing: true, request: already };

  if ((await pendingForPhone(phone)) >= MAX_PENDING_PER_PHONE) {
    return no(
      429,
      "too_many_pending",
      "This number already has bookings waiting for the clinic to confirm. Please wait for them, or phone the clinic.",
      "patient.phone",
    );
  }

  try {
    const { request, existing } = await createWebRequest(
      {
        requestId: b.requestId,
        doctorId: doctor.id,
        dateAd,
        dateBs: adToBsText(dateAd),
        timeHhmm: b.time,
        name: b.patient.name,
        phone,
        sex: b.patient.sex,
        ageValue: age ? age.value : null,
        ageUnit: age ? age.unit : null,
        address: b.patient.address,
        reason: b.reason,
      },
      now,
    );
    if (!existing) {
      // No name or number in the audit detail (Rules §2.7) — the row has them.
      await recordAudit(null, "web_booking.requested", {
        entity: "web_booking_request",
        entityId: request.id,
        detail: `${doctor.name} · ${request.dateBs} ${request.timeHhmm} · ${request.ref}`,
      });
    }
    return { ok: true, existing, request };
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return no(409, "slot_taken", "That time has just been taken. Please choose another.", "time");
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// The desk answers
// ---------------------------------------------------------------------------

export class WebRequestError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = "WebRequestError";
    this.userMessage = userMessage;
  }
}

export interface ConfirmInput {
  id: string;
  /** An existing patient's id, or "new" to register them as they wrote themselves. */
  patientId: string;
  dateBs: string;
  timeHhmm: string;
  durationMin: number;
  userId: string;
}

export interface ConfirmResult {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  /** One plain line about the text to the patient, or "" when none was tried. */
  smsLine: string;
}

/**
 * Turn a request into a booking.
 *
 * Retry-safe from end to end: the new patient and the appointment both take
 * the request's own id, and both inserts are idempotent on it, so pressing
 * Confirm twice — or a dropped connection and a second press — books one
 * consultation for one person.
 */
export async function confirmWebRequest(
  input: ConfirmInput,
  sender: SmsSender = sendSms,
): Promise<ConfirmResult> {
  const req = await getWebRequest(input.id);
  if (!req) throw new WebRequestError("That request is no longer there.");
  if (req.status === "declined") {
    throw new WebRequestError("That request was declined. Book the person from the doctor's day instead.");
  }
  if (req.status === "confirmed" && req.appointmentId && req.patientId) {
    return { appointmentId: req.appointmentId, patientId: req.patientId, doctorId: req.doctorId, smsLine: "" };
  }

  const doctor = await getDoctor(req.doctorId);
  if (!doctor) throw new WebRequestError("That doctor is no longer there.");

  // Who it is for: somebody already on file, or registered now from what
  // they typed on the website.
  let patientId: string;
  if (input.patientId === "new") {
    const made = await createPatient({
      id: req.id,
      name: req.name,
      sex: req.sex,
      ageValue: req.ageValue,
      ageUnit: req.ageUnit,
      ageAsOfAd: req.ageValue != null ? req.createdAt.slice(0, 10) : null,
      dobAd: null,
      phone: req.phone,
      address: req.address,
      userId: input.userId,
    });
    patientId = made.id;
  } else {
    const patient = await getPatient(input.patientId);
    if (!patient) throw new WebRequestError("That patient record is no longer there.");
    if (patient.mergedIntoId) {
      throw new WebRequestError("That record was merged into another. Choose the one it was merged into.");
    }
    patientId = patient.id;
  }

  const dateAd = safeBsToAd(input.dateBs);
  if (!dateAd) throw new WebRequestError("Pick a date.");

  const appointment = await createAppointment({
    id: req.id,
    doctorId: req.doctorId,
    patientId,
    dateAd,
    dateBs: input.dateBs,
    timeHhmm: input.timeHhmm,
    durationMin: input.durationMin,
    reason: req.reason,
    bookedBy: input.userId,
    source: "web",
    fromRequestId: req.id,
  });

  const marked = await markWebRequestConfirmed(req.id, {
    patientId,
    appointmentId: appointment.id,
    userId: input.userId,
  });

  await recordAudit(input.userId, "web_booking.confirmed", {
    entity: "web_booking_request",
    entityId: req.id,
    detail: `${doctor.name} · ${input.dateBs} ${input.timeHhmm} · ${req.ref}`,
  });

  // Only the call that actually moved it to confirmed sends the text, so a
  // double press never texts the patient twice.
  const smsLine = marked
    ? await textThePatient(req, doctor.name, input.dateBs, dateAd, input.timeHhmm, sender)
    : "";

  return { appointmentId: appointment.id, patientId, doctorId: req.doctorId, smsLine };
}

/** Best-effort, like telling the doctor: the booking is already safe. */
async function textThePatient(
  req: WebBookingRow,
  doctorName: string,
  dateBs: string,
  dateAd: string,
  timeHhmm: string,
  sender: SmsSender,
): Promise<string> {
  try {
    const settings = await getWebBookingSettings();
    if (!settings.confirmSmsOn) return "";

    const phone = normalizeMobile(req.phone);
    if (!isNepaliMobile(phone)) {
      await recordConfirmSms(req.id, "off", "Not a mobile number.");
      return "No text was sent: the number they gave is not a mobile.";
    }
    const company = await getCompany();
    const text = fillConfirmMessage(settings.confirmSms || DEFAULT_CONFIRM_SMS, {
      name: req.name,
      doctor: doctorName,
      date: longBs(dateBs),
      date_ad: shortAd(dateAd),
      time: formatTime(timeHhmm),
      ref: req.ref,
      clinic: company.name,
    });

    const out = await sender(phone, text);
    if (out.ok) {
      await recordConfirmSms(req.id, "sent", "Sent.");
      return "The patient was sent a text.";
    }
    if (out.detail === NOT_SET_UP) {
      await recordConfirmSms(req.id, "off", out.detail);
      return "No text was sent: SMS sending is not set up yet.";
    }
    await recordConfirmSms(req.id, "failed", out.detail);
    return `The text to the patient did not go: ${out.detail}`;
  } catch (err) {
    console.error("[web booking sms]", (err as Error)?.name);
    return "The text to the patient could not be sent just now.";
  }
}

export async function declineWebRequest(
  id: string,
  reason: string,
  userId: string,
): Promise<void> {
  const req = await getWebRequest(id);
  if (!req) throw new WebRequestError("That request is no longer there.");
  if (req.status === "confirmed") {
    throw new WebRequestError("That request is already booked. Call the booking off from the doctor's day.");
  }
  if (req.status === "declined") return;

  await markWebRequestDeclined(id, reason.trim(), userId);
  await recordAudit(userId, "web_booking.declined", {
    entity: "web_booking_request",
    entityId: id,
    detail: `${req.ref}${reason.trim() ? ` · ${reason.trim()}` : ""}`,
  });
}
