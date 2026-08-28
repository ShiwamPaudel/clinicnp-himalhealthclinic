import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { exportAll, recordBackup } from "@/lib/repos/backup";

/**
 * GET /api/cron/backup — nightly snapshot (Vercel cron).
 * Records a daily backup. In production this is where the archive would also be
 * pushed to Blob storage; here it captures the snapshot size + retention record.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const archive = await exportAll();
  const size = JSON.stringify(archive).length;
  await recordBackup("daily", size);
  return NextResponse.json({ ok: true, size });
}
