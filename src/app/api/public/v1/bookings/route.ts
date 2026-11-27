import { openDoor, answer, refuse, visitorIp } from "@/lib/public-api";
import { submitWebBooking, publicView } from "@/lib/web-booking";
import { expireStaleWebRequests } from "@/lib/repos/web-bookings";
import {
  checkRateLimit,
  WEBSITE_BOOKING_VISITOR,
  WEBSITE_BOOKING_PHONE,
} from "@/lib/rate-limit";
import { normalizeMobile } from "@/lib/sms-text";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/v1/bookings — somebody on the website asks for a
 * consultation. It waits under Clinic → Requests until the front desk
 * confirms it. Idempotent on `requestId`. See Website-API.md.
 */
export async function POST(req: Request) {
  const shut = await openDoor(req);
  if (shut) return shut;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return refuse(400, "invalid", "Send the booking as JSON.");
  }

  const tooMany = () =>
    refuse(429, "too_many", "Too many bookings at once. Please try again later, or phone the clinic.");

  // Limits per visitor and per number. Counted before the booking is looked
  // at, so trying different times does not get round them.
  const ip = await checkRateLimit(WEBSITE_BOOKING_VISITOR, visitorIp(req));
  if (!ip.ok) return tooMany();
  const phoneRaw =
    raw && typeof raw === "object" && "patient" in raw
      ? String((raw as { patient?: { phone?: unknown } }).patient?.phone ?? "")
      : "";
  const phone = normalizeMobile(phoneRaw);
  if (phone) {
    const perPhone = await checkRateLimit(WEBSITE_BOOKING_PHONE, phone);
    if (!perPhone.ok) return tooMany();
  }

  await expireStaleWebRequests();
  const out = await submitWebBooking(raw);
  if (!out.ok) {
    return refuse(out.status, out.code, out.message, out.field ? { field: out.field } : {});
  }
  return answer(
    { ok: true, existing: out.existing, booking: publicView(out.request) },
    out.existing ? 200 : 201,
  );
}
