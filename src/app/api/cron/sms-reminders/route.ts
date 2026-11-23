import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getModules } from "@/lib/modules";
import { getCompany } from "@/lib/repos/company";
import { sendSms } from "@/lib/sms";
import { runSmsReminders } from "@/lib/sms-run";

/**
 * GET /api/cron/sms-reminders — sends the day's monthly SMS reminders.
 *
 * Scheduled once a day at 01:15 UTC, which is 7:00 in the morning in Nepal
 * (vercel.json). On a plan that runs schedules "within the hour" it lands
 * between about 6:45 and 7:45; the run sends everything due on the day
 * whenever it lands, so the minute does not matter.
 *
 * Like the other scheduled jobs it refuses anything that does not present
 * CRON_SECRET, so it is safe to leave reachable. Reminders need patients, so
 * with the Clinic module off — or the Pharmacy module, whose menu they live
 * in — nothing is sent.
 */

// Inside every plan's limit. The run itself stops starting new messages at
// 45 seconds; anything left goes out tomorrow morning (`dueState`).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const modules = await getModules();
  if (!modules.clinic || !modules.pharmacy) {
    return NextResponse.json({ ok: true, skipped: "module off" });
  }

  const company = await getCompany();
  const summary = await runSmsReminders({
    send: sendSms,
    clinicName: company.name,
  });

  return NextResponse.json({ ok: true, ...summary });
}
