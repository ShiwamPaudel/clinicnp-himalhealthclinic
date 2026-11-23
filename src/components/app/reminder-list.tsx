"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ulid } from "ulid";
import { MessageSquarePlus, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import {
  PatientPicker,
  type FoundPatient,
  type DraftPatient,
} from "@/components/clinic/patient-picker";
import {
  createReminderAction,
  changeReminderAction,
  stopReminderAction,
} from "@/app/(app)/reminders/actions";
import { formatPatientNo } from "@/lib/patient-no";
import { bsFromDbText } from "@/lib/bs";
import {
  fillMessage,
  mobileProblem,
  smsSize,
  unknownPlaceholders,
  MAX_SMS_MESSAGE,
} from "@/lib/sms-text";
import {
  describeSchedule,
  longBs,
  ordinal,
  upcomingDates,
  bsText,
} from "@/lib/sms-schedule";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

/** One reminder as the list shows it. Every date is already in words. */
export interface ReminderView {
  id: string;
  patientId: string;
  patientName: string;
  patientNo: number | null;
  phone: string;
  dayOfMonth: number;
  nextDateBs: string;
  message: string;
  status: "active" | "stopped";
  stoppedOn: string;
  stoppedByName: string;
  last: { status: "sending" | "sent" | "failed" | "missed"; dueBs: string | null; detail: string } | null;
}

const LAST_TONE: Record<NonNullable<ReminderView["last"]>["status"], BadgeTone> = {
  sending: "info",
  sent: "ok",
  failed: "danger",
  missed: "warn",
};

function lastLabel(last: NonNullable<ReminderView["last"]>): string {
  const when = last.dueBs ? ` · ${longBs(last.dueBs)}` : "";
  switch (last.status) {
    case "sent":
      return `Sent${when}`;
    case "failed":
      return `Not sent${when}`;
    case "missed":
      return `Missed${when}`;
    default:
      return `Sending${when}`;
  }
}

const TEXTAREA =
  "w-full rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[14px] leading-[1.45] text-sage-950 outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20";

export function ReminderList({
  rows,
  canManage,
  sharedMessage,
  clinicName,
  todayBs,
  tomorrowBs,
  showNew,
}: {
  rows: ReminderView[];
  canManage: boolean;
  sharedMessage: string;
  clinicName: string;
  todayBs: string;
  tomorrowBs: string;
  /** Opens the new-reminder form straight away (the empty state's button). */
  showNew?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // ---- a new one ----
  const [newOpen, setNewOpen] = useState(Boolean(showNew));
  const [formId, setFormId] = useState(() => ulid());
  const [chosen, setChosen] = useState<FoundPatient | null>(null);
  const [draft, setDraft] = useState<DraftPatient | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [firstBs, setFirstBs] = useState(tomorrowBs);
  const [useOwn, setUseOwn] = useState(false);
  const [ownText, setOwnText] = useState("");

  // ---- changing one ----
  const [changing, setChanging] = useState<ReminderView | null>(null);
  const [chPhone, setChPhone] = useState("");
  const [chNextBs, setChNextBs] = useState("");
  const [chUseOwn, setChUseOwn] = useState(false);
  const [chText, setChText] = useState("");

  // ---- stopping one ----
  const [stopping, setStopping] = useState<ReminderView | null>(null);

  function openNew() {
    setFormId(ulid());
    setChosen(null);
    setDraft(null);
    setPhone("");
    setPhoneTouched(false);
    setFirstBs(tomorrowBs);
    setUseOwn(false);
    setOwnText("");
    setNewOpen(true);
  }

  function openChange(r: ReminderView) {
    setChanging(r);
    setChPhone(r.phone);
    setChNextBs(r.nextDateBs);
    setChUseOwn(r.message.trim() !== "");
    setChText(r.message.trim() !== "" ? r.message : sharedMessage);
  }

  const patientName = chosen?.name ?? draft?.name.trim() ?? "";
  const newPhoneProblem = mobileProblem(phone);
  const newMessage = useOwn ? ownText : "";
  const newDateProblem =
    firstBs && firstBs <= todayBs
      ? "Pick tomorrow or a later day. Reminders go out at 6 in the morning."
      : null;
  const newMessageProblem = messageProblem(newMessage);
  const canSubmitNew =
    !busy &&
    (chosen !== null || (draft !== null && draft.name.trim() !== "")) &&
    newPhoneProblem === null &&
    newDateProblem === null &&
    newMessageProblem === null &&
    !(useOwn && ownText.trim() === "");

  async function submitNew() {
    const patientId = chosen ? chosen.id : draft ? "new" : "";
    if (!patientId) {
      toast.error("Say who the reminder is for.");
      return;
    }
    setBusy(true);
    const res = await createReminderAction(
      {
        id: formId,
        patientId,
        phone,
        firstDateBs: firstBs,
        message: newMessage,
      },
      draft
        ? {
            name: draft.name,
            sex: draft.sex,
            ageValue: draft.ageValue,
            ageUnit: draft.ageUnit,
            address: draft.address,
          }
        : undefined,
    );
    setBusy(false);
    if (res.ok) {
      toast.success(strings.reminderSaved);
      if (res.note) toast.info(res.note);
      setNewOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  const chPhoneProblem = changing ? mobileProblem(chPhone) : null;
  const chDateChanged = changing ? chNextBs !== changing.nextDateBs : false;
  const chDateProblem =
    chDateChanged && chNextBs <= todayBs
      ? "Pick tomorrow or a later day. Reminders go out at 6 in the morning."
      : null;
  const chMessage = chUseOwn ? chText : "";
  const chMessageProblem = messageProblem(chMessage);

  async function submitChange() {
    if (!changing) return;
    setBusy(true);
    const res = await changeReminderAction({
      id: changing.id,
      phone: chPhone,
      nextDateBs: chNextBs,
      message: chMessage,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.reminderChanged);
      setChanging(null);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function submitStop() {
    if (!stopping) return;
    setBusy(true);
    const res = await stopReminderAction(stopping.id);
    setBusy(false);
    if (res.ok) {
      toast.success(strings.reminderStopped);
      setStopping(null);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openNew}>
            <MessageSquarePlus className="h-4 w-4" />
            {strings.newReminder}
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const stopped = r.status === "stopped";
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-[10px] border border-line bg-cream-50 p-4",
                  stopped && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="text-[15px] font-semibold text-sage-900 hover:text-clinic-700 hover:underline"
                      >
                        {r.patientName}
                      </Link>
                      <span className="font-mono text-[12px] text-clinic-700">
                        {r.patientNo != null ? formatPatientNo(r.patientNo) : "—"}
                      </span>
                      {r.last && (
                        <Badge tone={LAST_TONE[r.last.status]}>{lastLabel(r.last)}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-sage-600">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Phone className="h-3.5 w-3.5" />
                        {r.phone}
                      </span>
                      <span>{describeSchedule(r.dayOfMonth)}</span>
                      <span>{r.message.trim() ? strings.ownMessage : strings.sharedMessage}</span>
                    </div>
                    {r.last?.status === "failed" && r.last.detail && (
                      <p className="mt-1 text-[13px] text-danger-600">{r.last.detail}</p>
                    )}
                    {stopped && (
                      <p className="mt-1 text-[13px] text-sage-500">
                        Stopped {r.stoppedOn}
                        {r.stoppedByName ? ` by ${r.stoppedByName}` : ""}
                      </p>
                    )}
                  </div>

                  {!stopped && (
                    <div className="w-[170px] shrink-0">
                      <div className="text-[12px] text-sage-500">Next message</div>
                      <div className="text-[15px] font-semibold text-sage-900">
                        {longBs(r.nextDateBs)}
                      </div>
                    </div>
                  )}

                  {canManage && !stopped && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" onClick={() => openChange(r)}>
                        Change
                      </Button>
                      <Button variant="ghost" onClick={() => setStopping(r)}>
                        Stop
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- new ---- */}
      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={strings.newReminder}
        className="max-w-lg"
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <PatientPicker
            label={strings.whoIsTheReminderFor}
            askPhone={false}
            chosen={chosen}
            draft={draft}
            onChoose={(p) => {
              setChosen(p);
              if (p) {
                setDraft(null);
                setPhone(p.phone);
                setPhoneTouched(p.phone !== "");
              }
            }}
            onDraftChange={(d) => {
              setDraft(d);
              if (d) setChosen(null);
            }}
          />

          <Field
            label={strings.mobileForSms}
            error={phoneTouched ? (newPhoneProblem ?? undefined) : undefined}
            hint={phoneHint(chosen, phone)}
          >
            <Input
              inputMode="tel"
              value={phone}
              invalid={phoneTouched && newPhoneProblem !== null}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              placeholder="98XXXXXXXX"
            />
          </Field>

          <Field label={strings.firstMessageOn} error={newDateProblem ?? undefined}>
            <DatePickerBS value={firstBs} onChange={setFirstBs} />
          </Field>

          {firstBs && !newDateProblem && <Schedule firstBs={firstBs} />}

          <MessageChoice
            useOwn={useOwn}
            onUseOwn={(v) => {
              setUseOwn(v);
              if (v && ownText.trim() === "") setOwnText(sharedMessage);
            }}
            ownText={ownText}
            onOwnText={setOwnText}
            problem={newMessageProblem}
          />

          <MessagePreview
            template={useOwn ? ownText : sharedMessage}
            name={patientName || "the patient"}
            dateBs={firstBs && !newDateProblem ? firstBs : tomorrowBs}
            clinic={clinicName}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setNewOpen(false)}>
            {strings.cancel}
          </Button>
          <Button onClick={submitNew} disabled={!canSubmitNew}>
            {busy ? "Setting up…" : "Set up reminder"}
          </Button>
        </div>
      </Dialog>

      {/* ---- change ---- */}
      <Dialog
        open={changing !== null}
        onClose={() => setChanging(null)}
        title={changing ? `Change the reminder for ${changing.patientName}` : "Change"}
        className="max-w-lg"
      >
        {changing && (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
            <Field label={strings.mobileForSms} error={chPhoneProblem ?? undefined}>
              <Input
                inputMode="tel"
                value={chPhone}
                invalid={chPhoneProblem !== null}
                onChange={(e) => setChPhone(e.target.value)}
              />
            </Field>

            <Field
              label="Next message on"
              error={chDateProblem ?? undefined}
              hint={
                chDateChanged
                  ? `From then on, every month on the ${ordinal(bsFromDbText(chNextBs).day)}.`
                  : `Every month on the ${ordinal(changing.dayOfMonth)}. Pick another day to change it.`
              }
            >
              <DatePickerBS value={chNextBs} onChange={setChNextBs} />
            </Field>

            <MessageChoice
              useOwn={chUseOwn}
              onUseOwn={(v) => {
                setChUseOwn(v);
                if (v && chText.trim() === "") setChText(sharedMessage);
              }}
              ownText={chText}
              onOwnText={setChText}
              problem={chMessageProblem}
            />

            <MessagePreview
              template={chUseOwn ? chText : sharedMessage}
              name={changing.patientName}
              dateBs={chNextBs}
              clinic={clinicName}
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setChanging(null)}>
            {strings.cancel}
          </Button>
          <Button
            onClick={submitChange}
            disabled={
              busy ||
              chPhoneProblem !== null ||
              chDateProblem !== null ||
              chMessageProblem !== null ||
              (chUseOwn && chText.trim() === "")
            }
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Dialog>

      {/* ---- stop ---- */}
      <Dialog
        open={stopping !== null}
        onClose={() => setStopping(null)}
        title={stopping ? `Stop the reminder for ${stopping.patientName}?` : "Stop"}
      >
        <p className="text-[14px] text-sage-600">
          No more messages will go out to {stopping?.phone}. The reminder stays
          on the Stopped list. To start again, set up a new one.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStopping(null)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submitStop} disabled={busy}>
            {busy ? "Stopping…" : "Stop reminder"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function messageProblem(text: string): string | null {
  if (text.length > MAX_SMS_MESSAGE) return "That message is too long.";
  const unknown = unknownPlaceholders(text);
  if (unknown.length > 0) {
    return `${unknown.join(", ")} will not be filled in. Use {name}, {date} or {clinic}.`;
  }
  return null;
}

function phoneHint(chosen: FoundPatient | null, phone: string): string | undefined {
  if (!chosen) return undefined;
  if (chosen.phone.trim() === "") {
    return "This patient has no number on file. It will be saved to their details too.";
  }
  if (phone.trim() !== "" && phone.replace(/\D/g, "") !== chosen.phone.replace(/\D/g, "")) {
    return "Only this reminder uses this number. The patient's details keep their own.";
  }
  return undefined;
}

/** The next three dates, so the front desk sees the pattern before saving. */
function Schedule({ firstBs }: { firstBs: string }) {
  const first = bsFromDbText(firstBs);
  const dates = upcomingDates(first, first.day, 3).map((d) => longBs(bsText(d)));
  return (
    <div className="rounded-[8px] bg-sage-75 px-3 py-2 text-[13px] text-sage-700">
      <p>
        {dates.join(", ")} and every month after, until it is stopped.{" "}
        {strings.remindersGoOutAt}
      </p>
      {first.day >= 30 && (
        <p className="mt-1">
          In a month without a {ordinal(first.day)}, it goes on the month&apos;s last day.
        </p>
      )}
    </div>
  );
}

function MessageChoice({
  useOwn,
  onUseOwn,
  ownText,
  onOwnText,
  problem,
}: {
  useOwn: boolean;
  onUseOwn: (v: boolean) => void;
  ownText: string;
  onOwnText: (v: string) => void;
  problem: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-sage-900">Message</legend>
      <label className="flex items-center gap-2 text-[14px] text-sage-900">
        <input
          type="radio"
          checked={!useOwn}
          onChange={() => onUseOwn(false)}
          className="h-4 w-4 accent-sage-700"
        />
        Use the shared message
      </label>
      <label className="flex items-center gap-2 text-[14px] text-sage-900">
        <input
          type="radio"
          checked={useOwn}
          onChange={() => onUseOwn(true)}
          className="h-4 w-4 accent-sage-700"
        />
        Write a message for this reminder only
      </label>
      {useOwn && (
        <>
          <textarea
            aria-label="Message for this reminder"
            value={ownText}
            onChange={(e) => onOwnText(e.target.value)}
            rows={4}
            maxLength={MAX_SMS_MESSAGE}
            className={TEXTAREA}
          />
          <p className="text-[12px] text-sage-500">
            {"{name}"}, {"{date}"} and {"{clinic}"} are filled in when it is sent.
          </p>
        </>
      )}
      {problem && <p className="text-[12px] text-danger-600">{problem}</p>}
    </fieldset>
  );
}

/** Exactly what the patient will read, and how many SMS it takes. */
export function MessagePreview({
  template,
  name,
  dateBs,
  clinic,
}: {
  template: string;
  name: string;
  dateBs: string;
  clinic: string;
}) {
  const text = fillMessage(template, {
    name,
    date: dateBs ? longBs(dateBs) : "",
    clinic,
  });
  const size = smsSize(text);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-sage-900">What the patient gets</span>
      <p className="whitespace-pre-wrap rounded-[8px] border border-line bg-cream-100 px-3 py-2 text-[14px] text-sage-900">
        {text || "—"}
      </p>
      <p className="text-[12px] text-sage-500">
        {size.length} characters · {size.parts === 1 ? "1 SMS" : `${size.parts} SMS`} each month
        {size.unicode ? " · Nepali letters fit 70 to an SMS instead of 160" : ""}
      </p>
    </div>
  );
}
