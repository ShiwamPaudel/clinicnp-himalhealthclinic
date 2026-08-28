import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { exportAll, recordBackup } from "@/lib/repos/backup";
import { sweepExpired } from "@/lib/repos/rate-limit";

/**
 * GET /api/cron/backup — nightly snapshot (Vercel cron).
 * Records a daily backup. In production this is where the archive would also be
 * pushed to Blob storage; here it captures the snapshot size + retention record.
 * Also sweeps rate-limit windows that have already ended.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const archive = await exportAll();
  const size = JSON.stringify(archive).length;
  await recordBackup("daily", size);
  const swept = await sweepExpired(Math.floor(Date.now() / 1000));
  return NextResponse.json({ ok: true, size, swept });
}
