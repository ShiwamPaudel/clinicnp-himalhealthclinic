import { openDoor, answer, refuse } from "@/lib/public-api";
import { publicView } from "@/lib/web-booking";
import { expireStaleWebRequests, getWebRequestByRef } from "@/lib/repos/web-bookings";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/bookings/{ref} — where a request has got to: pending,
 * confirmed (with the time the clinic confirmed), declined or expired.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const shut = await openDoor(req);
  if (shut) return shut;

  const { ref } = await params;
  if (!/^[0-9A-Za-z]{8}$/.test(ref)) return refuse(404, "not_found", "No booking has that code.");

  await expireStaleWebRequests();
  const r = await getWebRequestByRef(ref);
  if (!r) return refuse(404, "not_found", "No booking has that code.");
  return answer({ ok: true, booking: publicView(r) });
}
