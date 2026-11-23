import Link from "next/link";
import { MessageSquareText, Send } from "lucide-react";
import { requireBackOfficeUser, canBook } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getCompany } from "@/lib/repos/company";
import {
  getSharedMessage,
  getStoredSharedMessage,
  listReminders,
  recentSent,
  reminderCounts,
  type SmsReminderRow,
  type SentStatus,
} from "@/lib/repos/sms-reminders";
import { smsConfigured } from "@/lib/sms";
import { adFromIso, bsToDbText, toBS, todayInNepal } from "@/lib/bs";
import { addDaysIso, bsTextToAdIso, longBs, nepalWhen } from "@/lib/sms-schedule";
import { formatPatientNo } from "@/lib/patient-no";
import { PageShell } from "@/components/app/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { ReminderList, type ReminderView } from "@/components/app/reminder-list";
import { SmsMessagePanel } from "@/components/app/sms-message-panel";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export const metadata = { title: "Reminders" };

type Show = "active" | "stopped" | "sent";

const SENT_TONE: Record<SentStatus, BadgeTone> = {
  sending: "info",
  sent: "ok",
  failed: "danger",
  missed: "warn",
};
const SENT_LABEL: Record<SentStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  failed: "Not sent",
  missed: "Missed",
};

/**
 * Reminders — a text message to a patient on the same Nepali day every month,
 * until somebody stops it (C-028). Lives in the Pharmacy menu; needs the
 * Clinic module too, because a reminder belongs to a patient.
 */
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireBackOfficeUser();
  await requireModulePage("pharmacy");
  await requireModulePage("clinic");

  const sp = await searchParams;
  const show: Show =
    sp.show === "stopped" || sp.show === "sent" ? sp.show : "active";

  const canManage = canBook(user.role);
  const isAdmin = user.role === "admin";
  const configured = smsConfigured();

  const todayBs = bsToDbText(todayInNepal());
  // Tomorrow in BS, worked out on the AD calendar (Rules §1.5).
  const tomorrowBs = bsToDbText(
    toBS(adFromIso(addDaysIso(bsTextToAdIso(todayBs), 1))),
  );

  const [counts, company, shared, stored, reminders, sent] = await Promise.all([
    reminderCounts(),
    getCompany(),
    getSharedMessage(),
    isAdmin ? getStoredSharedMessage() : Promise.resolve(""),
    show === "sent" ? Promise.resolve([]) : listReminders(show),
    show === "sent" ? recentSent(200) : Promise.resolve([]),
  ]);

  const rows: ReminderView[] = reminders.map(toView);

  const tabs: { key: Show; label: string; count?: number }[] = [
    { key: "active", label: "Running", count: counts.active },
    { key: "stopped", label: "Stopped", count: counts.stopped },
    { key: "sent", label: "Messages sent" },
  ];

  return (
    <PageShell title={strings.smsReminders}>
      <div className="flex flex-col gap-4">
        {!configured && (
          <p className="rounded-[10px] border border-line bg-warn-100 px-4 py-3 text-[13px] text-warn-600">
            {strings.smsNotSetUp}
          </p>
        )}

        <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Reminders">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key === "active" ? "/reminders" : `/reminders?show=${t.key}`}
              aria-current={show === t.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[14px]",
                show === t.key
                  ? "border-sage-700 font-semibold text-sage-900"
                  : "border-transparent text-sage-500 hover:text-sage-700",
              )}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="rounded-[999px] bg-sage-75 px-1.5 text-[11px] font-semibold text-sage-700">
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {show === "sent" ? (
          sent.length === 0 ? (
            <EmptyState
              icon={Send}
              message="No messages have gone out yet. They are listed here from the first morning a reminder is due."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Patient</TH>
                  <TH>Number</TH>
                  <TH>Result</TH>
                  <TH>Message</TH>
                </TR>
              </THead>
              <tbody>
                {sent.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap text-[13px]">
                      {nepalWhen(s.updatedAt)}
                      {s.dueDateBs && (
                        <div className="text-[12px] text-sage-500">
                          for {longBs(s.dueDateBs)}
                        </div>
                      )}
                    </TD>
                    <TD>
                      {s.patientId ? (
                        <Link
                          href={`/patients/${s.patientId}`}
                          className="font-medium text-sage-900 hover:text-clinic-700 hover:underline"
                        >
                          {s.patientName}
                        </Link>
                      ) : (
                        <span className="text-sage-500">Test message</span>
                      )}
                      {s.patientNo != null && (
                        <span className="ml-2 font-mono text-[12px] text-clinic-700">
                          {formatPatientNo(s.patientNo)}
                        </span>
                      )}
                    </TD>
                    <TD className="font-mono text-[13px]">{s.phone}</TD>
                    <TD>
                      <Badge tone={SENT_TONE[s.status]}>{SENT_LABEL[s.status]}</Badge>
                      {s.detail && s.status !== "sent" && (
                        <div className="mt-1 max-w-[260px] text-[12px] text-sage-600">
                          {s.detail}
                        </div>
                      )}
                    </TD>
                    <TD className="max-w-[320px] text-[13px] text-sage-600">
                      <span className="line-clamp-2" title={s.message}>
                        {s.message}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : (
          <div
            className={cn(
              "grid gap-5",
              isAdmin && show === "active" && "lg:grid-cols-[minmax(0,1fr)_380px]",
            )}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <ReminderList
                rows={rows}
                canManage={canManage && show === "active"}
                sharedMessage={shared}
                clinicName={company.name}
                todayBs={todayBs}
                tomorrowBs={tomorrowBs}
              />
              {rows.length === 0 && (
                <EmptyState
                  icon={MessageSquareText}
                  message={
                    show === "active"
                      ? "No reminders yet. Set one up and the patient gets an SMS on the same day every month."
                      : "No reminder has been stopped."
                  }
                />
              )}
            </div>

            {isAdmin && show === "active" && (
              <SmsMessagePanel
                stored={stored}
                clinicName={company.name}
                sampleDateBs={tomorrowBs}
                configured={configured}
              />
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function toView(r: SmsReminderRow): ReminderView {
  return {
    id: r.id,
    patientId: r.patientId,
    patientName: r.patientName,
    patientNo: r.patientNo,
    phone: r.phone,
    dayOfMonth: r.dayOfMonth,
    nextDateBs: r.nextDateBs,
    message: r.message,
    status: r.status,
    stoppedOn: r.stoppedAt ? nepalWhen(r.stoppedAt) : "",
    stoppedByName: r.stoppedByName,
    last: r.lastStatus
      ? { status: r.lastStatus, dueBs: r.lastDueBs, detail: r.lastDetail }
      : null,
  };
}
