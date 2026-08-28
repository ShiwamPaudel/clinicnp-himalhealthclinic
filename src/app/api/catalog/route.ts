import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { catalogSnapshot } from "@/lib/repos/catalog";

/**
 * GET /api/catalog — the POS catalog snapshot (items + units + live batches).
 * Session-protected. The client caches this in IndexedDB (Phase 3).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }
  const snapshot = await catalogSnapshot();
  return NextResponse.json(snapshot);
}
