import { notFound } from "next/navigation";
import { requireUser, canBook } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import {
  answeredWebRequests,
  expireStaleWebRequests,
  pendingWebRequests,
} from "@/lib/repos/web-bookings";
import { findPossibleDuplicates } from "@/lib/repos/patients";
import { getWebBookingSettings } from "@/lib/repos/company";
import { smsConfigured } from "@/lib/sms";
import { displayAge } from "@/lib/age";
import { adToIso, toAD, todayInNepal } from "@/lib/bs";
import { nepalWhen } from "@/lib/sms-schedule";
import { PageShell } from "@/components/app/page-shell";
import {
  WebRequests,
  type PendingRequest,
  type AnsweredRequest,
} from "@/components/clinic/web-requests";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

/**
 * Clinic → Requests: consultations asked for on the website, waiting for the
 * front desk to say yes or no (C-029). Admin and Staff only — the people who
 * can book at the desk.
 */
export default async function RequestsPage() {
  const user = await requireUser();
  await requireModulePage("clinic");
  if (!canBook(user.role)) notFound();

  await expireStaleWebRequests();
  const [pending, answered, settings] = await Promise.all([
    pendingWebRequests(),
    answeredWebRequests(60),
    getWebBookingSettings(),
  ]);

  const todayAd = adToIso(toAD(todayInNepal()));

  // Somebody who has been before should not get a second patient number. The
  // desk is shown who might be the same person and chooses (Rules §2.8).
  const withMatches: PendingRequest[] = await Promise.all(
    pending.map(async (r) => {
      const matches = await findPossibleDuplicates(r.name, r.phone);
      return {
        id: r.id,
        ref: r.ref,
        doctorId: r.doctorId,
        doctorName: r.doctorName,
        dateAd: r.dateAd,
        dateBs: r.dateBs,
        timeHhmm: r.timeHhmm,
        durationMin: r.durationMin,
        name: r.name,
        phone: r.phone,
        sex: r.sex,
        ageLabel:
          r.ageValue != null && r.ageUnit
            ? displayAge(
                { value: r.ageValue, unit: r.ageUnit, asOfAd: r.createdAt.slice(0, 10), dobAd: null },
                todayAd,
              ).short
            : "",
        address: r.address,
        reason: r.reason,
        receivedAt: nepalWhen(r.createdAt),
        matches: matches
          .filter((m) => m.patient.active && !m.patient.mergedIntoId)
          .map((m) => ({
            id: m.patient.id,
            patientNo: m.patient.patientNo,
            name: m.patient.name,
            phone: m.patient.phone,
            why: m.reason,
            lastVisitBs: m.lastVisitBs,
          })),
      };
    }),
  );

  const done: AnsweredRequest[] = answered.map((r) => ({
    id: r.id,
    ref: r.ref,
    status: r.status,
    doctorId: r.doctorId,
    doctorName: r.doctorName,
    name: r.name,
    askedDateBs: r.dateBs,
    askedTime: r.timeHhmm,
    bookedDateBs: r.bookedDateBs,
    bookedTime: r.bookedTimeHhmm,
    patientId: r.patientId,
    patientNo: r.patientNo,
    declineReason: r.declineReason,
    reviewedBy: r.reviewedByName,
    when: nepalWhen(r.reviewedAt ?? r.updatedAt),
    smsStatus: r.smsStatus,
    smsDetail: r.smsDetail,
  }));

  return (
    <PageShell title="Requests">
      <WebRequests
        pending={withMatches}
        answered={done}
        accepting={settings.accepting}
        smsOn={settings.confirmSmsOn}
        smsReady={smsConfigured()}
        isAdmin={user.role === "admin"}
      />
    </PageShell>
  );
}
