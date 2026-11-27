"use server";

/**
 * actions.ts — booking, moving and cancelling a consultation.
 *
 * Booking is the only place in the clinic where the software reaches outside
 * the building. The rule is that it reaches out *after* the booking is safe:
 * the consultation is written down first, and only then is the doctor told.
 * A mail service having a bad afternoon must never be the reason the front
 * desk has to ask the patient to call back.
 */
import { revalidatePath } from "next/cache";
import {
  assertCanBook,
  NotAuthorizedError,
} from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import {
  createAppointment,
  getAppointment,
  rescheduleAppointment,
  setAppointmentStatus,
  DoubleBookedError,
} from "@/lib/repos/appointments";
import { getDoctor } from "@/lib/repos/doctors";
import { getPatient, createPatient } from "@/lib/repos/patients";
import { tellTheDoctor } from "@/lib/booking-alerts";
import {
  bookConsultationSchema,
  rescheduleConsultationSchema,
  consultationStatusSchema,
} from "@/lib/validators";
import { bsFromDbText, toAD, adToIso } from "@/lib/bs";
import { isSaneAge, type AgeUnit } from "@/lib/age";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
  /** What actually reached the doctor, so the screen can say so honestly. */
  alerts?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof DoubleBookedError) return fail(err.userMessage);
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[consultation action]", err);
  return fail("Something went wrong. Please try again.");
}

async function guard() {
  await requireModule("clinic");
  return assertCanBook();
}

function refresh(doctorId: string) {
  revalidatePath("/doctors");
  revalidatePath(`/doctors/${doctorId}`);
  revalidatePath("/my/schedule");
}

/**
 * Someone new, registered from the booking screen itself.
 *
 * A person phoning to book has never been to the clinic more often than not,
 * and making the front desk leave the screen, register them, and come back
 * loses the booking half the time.
 */
export interface NewPatientForBooking {
  name: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  phone: string;
  address: string;
}

export async function bookConsultationAction(
  input: unknown,
  newPatient?: NewPatientForBooking,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = bookConsultationSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    const doctor = await getDoctor(data.doctorId);
    if (!doctor) return fail("That doctor is no longer there.");
    if (!doctor.active) {
      return fail(`${doctor.name} is not seeing patients at the moment.`);
    }

    // Either the patient is one already on file, or this is the first time
    // anybody in the clinic has heard of them.
    let patientId = data.patientId;
    if (patientId === "new") {
      if (!newPatient || !newPatient.name.trim()) {
        return fail("Enter the patient's name.");
      }
      if (
        newPatient.ageValue != null &&
        newPatient.ageUnit != null &&
        !isSaneAge(newPatient.ageValue, newPatient.ageUnit)
      ) {
        return fail("Check the age.");
      }
      const todayAd = adToIso(new Date());
      const made = await createPatient({
        // The booking's own id, which the browser minted once: a retried
        // submit finds this person already registered instead of registering
        // them a second time (createPatient is idempotent on the id).
        id: data.id,
        name: newPatient.name.trim(),
        sex: newPatient.sex,
        ageValue: newPatient.ageValue,
        ageUnit: newPatient.ageUnit,
        ageAsOfAd: newPatient.ageValue != null ? todayAd : null,
        dobAd: null,
        phone: newPatient.phone.trim(),
        address: newPatient.address.trim(),
        userId: user.id,
      });
      patientId = made.id;
    } else {
      const patient = await getPatient(patientId);
      if (!patient) return fail("That patient record is no longer there.");
    }

    const dateAd = adToIso(toAD(bsFromDbText(data.dateBs)));

    const appointment = await createAppointment({
      id: data.id,
      doctorId: data.doctorId,
      patientId,
      dateAd,
      dateBs: data.dateBs,
      timeHhmm: data.timeHhmm,
      durationMin: data.durationMin,
      reason: data.reason.trim(),
      bookedBy: user.id,
    });

    await recordAudit(user.id, "consultation.booked", {
      entity: "appointment",
      entityId: appointment.id,
      detail: `${doctor.name} · ${data.dateBs} ${data.timeHhmm}`,
    });

    // The booking is safe from here on. Telling the doctor is best-effort.
    const alerts = await tellTheDoctor(appointment.id, "booked");

    refresh(data.doctorId);
    return { ok: true, id: appointment.id, alerts };
  } catch (err) {
    return handle(err);
  }
}

export async function rescheduleConsultationAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = rescheduleConsultationSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    const before = await getAppointment(data.id);
    if (!before) return fail("That consultation is no longer there.");

    await rescheduleAppointment(data.id, {
      dateAd: adToIso(toAD(bsFromDbText(data.dateBs))),
      dateBs: data.dateBs,
      timeHhmm: data.timeHhmm,
      durationMin: data.durationMin,
    });

    await recordAudit(user.id, "consultation.moved", {
      entity: "appointment",
      entityId: data.id,
      detail: `${before.dateBs} ${before.timeHhmm} → ${data.dateBs} ${data.timeHhmm}`,
    });

    const alerts = await tellTheDoctor(data.id, "moved");

    refresh(before.doctorId);
    return { ok: true, alerts };
  } catch (err) {
    return handle(err);
  }
}

export async function setConsultationStatusAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = consultationStatusSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    const before = await getAppointment(data.id);
    if (!before) return fail("That consultation is no longer there.");

    await setAppointmentStatus(data.id, data.status, data.cancelReason.trim());

    await recordAudit(user.id, `consultation.${data.status}`, {
      entity: "appointment",
      entityId: data.id,
      detail: data.cancelReason.trim(),
    });

    // A doctor is told when a consultation vanishes from their day, because
    // that is the one change that alters what they turn up for.
    const alerts =
      data.status === "cancelled"
        ? await tellTheDoctor(data.id, "cancelled")
        : undefined;

    refresh(before.doctorId);
    return { ok: true, alerts };
  } catch (err) {
    return handle(err);
  }
}
