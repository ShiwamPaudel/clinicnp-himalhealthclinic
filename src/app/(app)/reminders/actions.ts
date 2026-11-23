"use server";

/**
 * actions.ts — setting up, changing and stopping monthly SMS reminders, the
 * shared message, and a test message.
 *
 * Reminders belong to patients, so they need the Clinic module as well as
 * the Pharmacy module whose menu they sit in. The front desk (Admin and
 * Staff) sets them up and stops them; the shared message and the test
 * message are the owner's.
 */
import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  assertCanBook,
  NotAuthorizedError,
} from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import { createPatient, getPatient } from "@/lib/repos/patients";
import { getCompany } from "@/lib/repos/company";
import {
  createReminder,
  getReminder,
  getSharedMessage,
  recordTestSend,
  setSharedMessage,
  stopReminder,
  updateReminder,
} from "@/lib/repos/sms-reminders";
import {
  smsReminderSchema,
  smsReminderChangeSchema,
  smsSharedMessageSchema,
  smsTestSchema,
} from "@/lib/validators";
import { bsFromDbText, bsToDbText, todayInNepal, adToIso } from "@/lib/bs";
import { bsTextToAdIso, longBs } from "@/lib/sms-schedule";
import {
  fillMessage,
  mobileProblem,
  normalizeMobile,
  unknownPlaceholders,
} from "@/lib/sms-text";
import { sendSms } from "@/lib/sms";
import { isSaneAge, type AgeUnit } from "@/lib/age";

export interface ReminderActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
  /** Said once saved, when the number also went onto the patient's details. */
  note?: string;
}

function fail(userMessage: string): ReminderActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ReminderActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[reminder action]", err);
  return fail("Something went wrong. Please try again.");
}

async function modules() {
  await requireModule("pharmacy");
  await requireModule("clinic");
}

function refresh() {
  revalidatePath("/reminders");
}

/** The first message must be on a day still to come: the run goes out early. */
function checkFutureDate(dateBs: string): string | null {
  const today = bsToDbText(todayInNepal());
  if (dateBs <= today) {
    return "Pick tomorrow or a later day. Reminders go out at 7 in the morning.";
  }
  return null;
}

function checkMessage(message: string): string | null {
  const unknown = unknownPlaceholders(message);
  if (unknown.length > 0) {
    return `${unknown.join(", ")} will not be filled in. Use {name}, {date} or {clinic}.`;
  }
  return null;
}

/** Somebody new, registered from the reminder form itself. */
export interface NewPatientForReminder {
  name: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  address: string;
}

export async function createReminderAction(
  input: unknown,
  newPatient?: NewPatientForReminder,
): Promise<ReminderActionResult> {
  try {
    await modules();
    const user = await assertCanBook();

    const parsed = smsReminderSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    // The same form sent twice (a double press, a retry on a bad connection)
    // is one reminder — and must not register a new patient twice either.
    if (data.id) {
      const already = await getReminder(data.id);
      if (already) return { ok: true, id: already.id };
    }

    const phoneProblem = mobileProblem(data.phone);
    if (phoneProblem) return fail(phoneProblem);
    const phone = normalizeMobile(data.phone);

    const dateProblem = checkFutureDate(data.firstDateBs);
    if (dateProblem) return fail(dateProblem);

    const messageProblem = checkMessage(data.message);
    if (messageProblem) return fail(messageProblem);

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
        name: newPatient.name.trim(),
        sex: newPatient.sex,
        ageValue: newPatient.ageValue,
        ageUnit: newPatient.ageUnit,
        ageAsOfAd: newPatient.ageValue != null ? todayAd : null,
        dobAd: null,
        phone,
        address: newPatient.address.trim(),
        userId: user.id,
      });
      patientId = made.id;
    } else {
      const patient = await getPatient(patientId);
      if (!patient || patient.mergedIntoId) {
        return fail("That patient record is no longer there.");
      }
    }

    const first = bsFromDbText(data.firstDateBs);
    const { reminder, phoneSavedToPatient } = await createReminder({
      id: data.id,
      patientId,
      phone,
      dayOfMonth: first.day,
      nextDateBs: data.firstDateBs,
      nextDateAd: bsTextToAdIso(data.firstDateBs),
      message: data.message.trim(),
      createdBy: user.id,
    });

    await recordAudit(user.id, "sms_reminder.created", {
      entity: "sms_reminder",
      entityId: reminder.id,
      detail: `from ${data.firstDateBs}, day ${first.day}`,
    });

    refresh();
    revalidatePath(`/patients/${patientId}`);
    return {
      ok: true,
      id: reminder.id,
      note:
        phoneSavedToPatient && data.patientId !== "new"
          ? "The number was also saved to the patient's details."
          : undefined,
    };
  } catch (err) {
    return handle(err);
  }
}

export async function changeReminderAction(
  input: unknown,
): Promise<ReminderActionResult> {
  try {
    await modules();
    const user = await assertCanBook();

    const parsed = smsReminderChangeSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    const before = await getReminder(data.id);
    if (!before) return fail("That reminder is no longer there.");
    if (before.status !== "active") return fail("That reminder has been stopped.");

    const phoneProblem = mobileProblem(data.phone);
    if (phoneProblem) return fail(phoneProblem);
    const phone = normalizeMobile(data.phone);

    const messageProblem = checkMessage(data.message);
    if (messageProblem) return fail(messageProblem);

    // A new date sets a new day of the month; leaving the date alone keeps
    // the day it was set for, even if this month's date was cut short.
    const dateChanged = data.nextDateBs !== before.nextDateBs;
    if (dateChanged) {
      const dateProblem = checkFutureDate(data.nextDateBs);
      if (dateProblem) return fail(dateProblem);
    }

    const changed = await updateReminder(data.id, {
      phone,
      message: data.message.trim(),
      dayOfMonth: dateChanged ? bsFromDbText(data.nextDateBs).day : before.dayOfMonth,
      nextDateBs: data.nextDateBs,
      nextDateAd: dateChanged ? bsTextToAdIso(data.nextDateBs) : before.nextDateAd,
    });
    if (!changed) return fail("That reminder has been stopped.");

    await recordAudit(user.id, "sms_reminder.changed", {
      entity: "sms_reminder",
      entityId: data.id,
      detail: dateChanged ? `${before.nextDateBs} → ${data.nextDateBs}` : "",
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function stopReminderAction(id: string): Promise<ReminderActionResult> {
  try {
    await modules();
    const user = await assertCanBook();

    const before = await getReminder(id);
    if (!before) return fail("That reminder is no longer there.");

    const stopped = await stopReminder(id, user.id);
    if (!stopped) return fail("That reminder was already stopped.");

    await recordAudit(user.id, "sms_reminder.stopped", {
      entity: "sms_reminder",
      entityId: id,
      detail: `next was ${before.nextDateBs}`,
    });

    refresh();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function saveSharedMessageAction(
  input: unknown,
): Promise<ReminderActionResult> {
  try {
    await modules();
    const user = await assertAdmin();

    const parsed = smsSharedMessageSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the message.");
    }
    const messageProblem = checkMessage(parsed.data.message);
    if (messageProblem) return fail(messageProblem);

    await setSharedMessage(parsed.data.message);
    await recordAudit(user.id, "sms_message.changed", { entity: "company" });

    refresh();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/**
 * Send the shared message to one number now, filled in as if for a patient
 * called "Test". Turning SMS on succeeds whether or not a message will ever
 * arrive; this is how the owner finds out before a patient does (D-125).
 */
export async function sendTestSmsAction(input: unknown): Promise<ReminderActionResult> {
  try {
    await modules();
    await assertAdmin();

    const parsed = smsTestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Enter a mobile number.");
    }
    const phoneProblem = mobileProblem(parsed.data.phone);
    if (phoneProblem) return fail(phoneProblem);
    const phone = normalizeMobile(parsed.data.phone);

    const company = await getCompany();
    const message = fillMessage(await getSharedMessage(), {
      name: "Test",
      date: longBs(bsToDbText(todayInNepal())),
      clinic: company.name,
    });

    const result = await sendSms(phone, message);
    await recordTestSend(
      phone,
      message,
      result.ok
        ? { ok: true, providerId: result.providerId, credits: result.credits }
        : { ok: false, detail: result.detail },
    );

    refresh();
    if (!result.ok) return fail(result.detail);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
