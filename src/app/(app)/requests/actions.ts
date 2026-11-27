"use server";

/**
 * actions.ts — the front desk answering a consultation asked for online.
 *
 * Confirming does what booking at the desk does — the booking is written
 * first, then the doctor is told — and, when Settings → Online booking says
 * so, the patient gets a text. Both messages are best-effort and both are
 * reported in plain words rather than assumed.
 */
import { revalidatePath } from "next/cache";
import { assertCanBook, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { DoubleBookedError } from "@/lib/repos/appointments";
import {
  confirmWebRequest,
  declineWebRequest,
  WebRequestError,
} from "@/lib/web-booking";
import { tellTheDoctor } from "@/lib/booking-alerts";
import {
  confirmWebRequestSchema,
  declineWebRequestSchema,
} from "@/lib/validators";

export interface RequestActionResult {
  ok: boolean;
  userMessage?: string;
  /** What reached the doctor and the patient, one line each. */
  notes?: string[];
  doctorId?: string;
  dateBs?: string;
}

function fail(userMessage: string): RequestActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): RequestActionResult {
  if (err instanceof DoubleBookedError) return fail(err.userMessage);
  if (err instanceof WebRequestError) return fail(err.userMessage);
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[web request action]", (err as Error)?.name);
  return fail("Something went wrong. Please try again.");
}

async function guard() {
  await requireModule("clinic");
  return assertCanBook();
}

function refresh(doctorId?: string) {
  revalidatePath("/requests");
  revalidatePath("/doctors");
  if (doctorId) revalidatePath(`/doctors/${doctorId}`);
  revalidatePath("/my/schedule");
}

export async function confirmWebRequestAction(
  input: unknown,
): Promise<RequestActionResult> {
  try {
    const user = await guard();
    const parsed = confirmWebRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const d = parsed.data;

    const done = await confirmWebRequest({
      id: d.id,
      patientId: d.patientId,
      dateBs: d.dateBs,
      timeHhmm: d.timeHhmm,
      durationMin: d.durationMin,
      userId: user.id,
    });

    const notes: string[] = [];
    const told = await tellTheDoctor(done.appointmentId, "booked");
    if (told) notes.push(told);
    if (done.smsLine) notes.push(done.smsLine);

    refresh(done.doctorId);
    return { ok: true, notes, doctorId: done.doctorId, dateBs: d.dateBs };
  } catch (err) {
    return handle(err);
  }
}

export async function declineWebRequestAction(
  input: unknown,
): Promise<RequestActionResult> {
  try {
    const user = await guard();
    const parsed = declineWebRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    await declineWebRequest(parsed.data.id, parsed.data.reason, user.id);
    refresh();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
