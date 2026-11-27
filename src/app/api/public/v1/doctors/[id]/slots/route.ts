import { openDoor, answer, refuse } from "@/lib/public-api";
import { publicSlots } from "@/lib/web-booking";
import { getWebBookingSettings } from "@/lib/repos/company";
import { expireStaleWebRequests } from "@/lib/repos/web-bookings";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/doctors/{id}/slots?date=YYYY-MM-DD (or ?dateBs=)
 * The times still free with this doctor that day. Times only: never who has
 * the others.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const shut = await openDoor(req);
  if (shut) return shut;

  const settings = await getWebBookingSettings();
  if (!settings.accepting) {
    return refuse(503, "not_accepting", "Online booking is paused just now. Please phone the clinic.");
  }

  const { id } = await params;
  const url = new URL(req.url);
  await expireStaleWebRequests();
  const out = await publicSlots(id, {
    date: url.searchParams.get("date"),
    dateBs: url.searchParams.get("dateBs"),
  });
  if (!out.ok) return refuse(out.status, out.code, out.message);
  return answer({ ok: true, doctorId: id, date: out.date, dateBs: out.dateBs, slots: out.slots });
}
