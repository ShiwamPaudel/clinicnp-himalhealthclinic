/**
 * booking-alerts.ts — tell a doctor about a booking, and say in one plain line
 * what reached them. Server only.
 *
 * Shared by the desk's booking actions and the confirmation of a website
 * request. Kept out of the actions files: anything exported from a
 * "use server" file becomes something a browser can call.
 */
import "server-only";
import { getAppointmentRow } from "@/lib/repos/appointments";
import { getDoctor } from "@/lib/repos/doctors";
import { getCompany } from "@/lib/repos/company";
import { notifyDoctorOfBooking } from "@/lib/notify";

/**
 * Best-effort: reach the doctor and say what came of it in one plain line.
 * Never throws — a failure here is reported, not raised.
 */
export async function tellTheDoctor(
  appointmentId: string,
  event: "booked" | "moved" | "cancelled",
): Promise<string> {
  try {
    const row = await getAppointmentRow(appointmentId);
    if (!row) return "";
    const doctor = await getDoctor(row.doctorId);
    if (!doctor) return "";
    const company = await getCompany();
    await notifyDoctorOfBooking(doctor, row, company.name, event);

    const { alertsFor } = await import("@/lib/repos/alerts");
    const lines = await alertsFor(appointmentId);
    const phone = lines.find((l) => l.channel === "push");
    const email = lines.find((l) => l.channel === "email");
    const reached: string[] = [];
    if (phone?.status === "sent") reached.push("their phone");
    if (email?.status === "sent") reached.push("their email");
    if (reached.length > 0) return `${doctor.name} was told on ${reached.join(" and ")}.`;
    return `${doctor.name} could not be told just now — the consultation is still booked.`;
  } catch (err) {
    console.error("[consultation alert]", err);
    return "";
  }
}
