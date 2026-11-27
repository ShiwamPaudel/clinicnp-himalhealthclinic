import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canBook } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { countPendingWebRequests } from "@/lib/repos/web-bookings";

export const dynamic = "force-dynamic";

/**
 * GET /api/web-requests/count — the number on the Requests tab. The menu asks
 * every minute and whenever somebody changes page, so a request that arrives
 * while the front desk is mid-bill still gets seen.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canBook(session.user.role)) return NextResponse.json({ ok: true, pending: 0 });
  const modules = await getModules();
  if (!modules.clinic) return NextResponse.json({ ok: true, pending: 0 });

  const pending = await countPendingWebRequests();
  return NextResponse.json(
    { ok: true, pending },
    { headers: { "Cache-Control": "no-store" } },
  );
}
