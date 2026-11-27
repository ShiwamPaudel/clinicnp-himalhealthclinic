import { openDoor, answer } from "@/lib/public-api";
import { publicDoctors, bookingWindow } from "@/lib/web-booking";
import { getWebBookingSettings } from "@/lib/repos/company";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/v1/doctors — every doctor seeing patients, and the rules
 * the website's date and time pickers should follow. See Website-API.md.
 */
export async function GET(req: Request) {
  const shut = await openDoor(req);
  if (shut) return shut;

  const [doctors, settings] = await Promise.all([
    publicDoctors(),
    getWebBookingSettings(),
  ]);
  return answer({
    ok: true,
    accepting: settings.accepting,
    window: bookingWindow(),
    doctors,
  });
}
