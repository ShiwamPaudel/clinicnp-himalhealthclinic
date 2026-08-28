import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getCompany } from "@/lib/repos/company";
import { drainCbms } from "@/lib/repos/cbms";

/** GET /api/cron/cbms — drains the CBMS queue (Vercel cron, every minute). */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const company = await getCompany();
  const result = await drainCbms({
    enabled: company.cbmsEnabled,
    endpoint: process.env.CBMS_ENDPOINT ?? "",
    username: process.env.CBMS_USERNAME ?? "",
    password: process.env.CBMS_PASSWORD ?? "",
  });
  return NextResponse.json({ ok: true, ...result });
}
