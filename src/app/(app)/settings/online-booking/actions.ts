"use server";

/**
 * actions.ts — Settings → Online booking. Owner only.
 */
import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import {
  getCompany,
  getWebBookingSettings,
  setWebBookingSettings,
} from "@/lib/repos/company";
import { webBookingSettingsSchema, smsTestSchema } from "@/lib/validators";
import {
  DEFAULT_CONFIRM_SMS,
  fillConfirmMessage,
  shortAd,
  unknownConfirmPlaceholders,
} from "@/lib/web-booking-text";
import { mobileProblem, normalizeMobile } from "@/lib/sms-text";
import { sendSms } from "@/lib/sms";
import { longBs } from "@/lib/sms-schedule";
import { formatTime } from "@/lib/appointment-types";
import { bsToDbText, todayInNepal, toAD, toBS, adToIso } from "@/lib/bs";

export interface OnlineBookingResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): OnlineBookingResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): OnlineBookingResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[online booking settings]", (err as Error)?.name);
  return fail("Something went wrong. Please try again.");
}

export async function saveOnlineBookingAction(input: unknown): Promise<OnlineBookingResult> {
  try {
    await requireModule("clinic");
    const user = await assertAdmin();
    const parsed = webBookingSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the settings.");
    }
    const next = parsed.data;
    const message = next.confirmSms.trim();
    const unknown = unknownConfirmPlaceholders(message);
    if (unknown.length > 0) {
      return fail(`${unknown.join(", ")} will not be filled in. Check the spelling.`);
    }

    const before = await getWebBookingSettings();
    await setWebBookingSettings({
      accepting: next.accepting,
      confirmSmsOn: next.confirmSmsOn,
      // The built-in wording is saved as nothing, so it stays the built-in one.
      confirmSms: message === DEFAULT_CONFIRM_SMS ? "" : message,
    });

    const changed: string[] = [];
    if (before.accepting !== next.accepting) {
      changed.push(next.accepting ? "website bookings on" : "website bookings paused");
    }
    if (before.confirmSmsOn !== next.confirmSmsOn) {
      changed.push(next.confirmSmsOn ? "confirmation text on" : "confirmation text off");
    }
    if ((before.confirmSms || DEFAULT_CONFIRM_SMS) !== (message || DEFAULT_CONFIRM_SMS)) {
      changed.push("confirmation text wording");
    }
    if (changed.length > 0) {
      await recordAudit(user.id, "online_booking.changed", {
        entity: "company",
        detail: changed.join(", "),
      });
    }

    revalidatePath("/settings/online-booking");
    revalidatePath("/requests");
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

/**
 * Send the saved confirmation text to one number now, filled in for a
 * patient called "Test" booked for tomorrow at 10 AM — so the owner sees what
 * a patient will get, and learns whether texts go out, before one does.
 */
export async function sendTestConfirmSmsAction(input: unknown): Promise<OnlineBookingResult> {
  try {
    await requireModule("clinic");
    await assertAdmin();
    const parsed = smsTestSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Enter a mobile number.");
    const problem = mobileProblem(parsed.data.phone);
    if (problem) return fail(problem);

    const [settings, company] = await Promise.all([getWebBookingSettings(), getCompany()]);
    const tomorrow = toAD(todayInNepal());
    tomorrow.setDate(tomorrow.getDate() + 1);
    const text = fillConfirmMessage(settings.confirmSms || DEFAULT_CONFIRM_SMS, {
      name: "Test",
      doctor: "Dr. Test",
      date: longBs(bsToDbText(toBS(tomorrow))),
      date_ad: shortAd(adToIso(tomorrow)),
      time: formatTime("10:00"),
      ref: "WTEST000",
      clinic: company.name,
    });

    const out = await sendSms(normalizeMobile(parsed.data.phone), text);
    if (!out.ok) return fail(out.detail);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
