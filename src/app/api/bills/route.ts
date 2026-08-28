import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ingestBill, InsufficientStockError } from "@/lib/repos/bills";
import { ingestBillSchema } from "@/lib/validators";
import {
  checkRateLimit,
  BILL_INGEST,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * POST /api/bills — the outbox target. Idempotent on the bill ULID:
 * retrying the same bill creates exactly one sale (Rules §1.8).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }


  const limit = await checkRateLimit(BILL_INGEST, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't read the bill." },
      { status: 400 },
    );
  }

  const parsed = ingestBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, userMessage: "That bill couldn't be saved." },
      { status: 400 },
    );
  }

  try {
    const result = await ingestBill({
      ...parsed.data,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Not enough stock: a definite business rejection, not a transient fault.
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          ok: false,
          code: "insufficient_stock",
          userMessage:
            "Not enough stock for one or more items — stock may have changed. Please review the bill.",
        },
        { status: 409 },
      );
    }
    console.error("[/api/bills]", err);
    return NextResponse.json(
      { ok: false, userMessage: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
