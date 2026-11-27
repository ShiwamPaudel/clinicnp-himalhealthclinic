"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, Phone, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { TimeChooser } from "@/components/clinic/consultation-day";
import {
  confirmWebRequestAction,
  declineWebRequestAction,
} from "@/app/(app)/requests/actions";
import {
  DURATION_CHOICES,
  describeDuration,
  formatTime,
} from "@/lib/appointment-types";
import { formatPatientNo } from "@/lib/patient-no";
import { formatBS, bsFromDbText } from "@/lib/bs";
import { shortAd } from "@/lib/web-booking-text";
import { cn } from "@/lib/cn";

export interface RequestMatch {
  id: string;
  patientNo: number | null;
  name: string;
  phone: string;
  why: string;
  lastVisitBs: string | null;
}

export interface PendingRequest {
  id: string;
  ref: string;
  doctorId: string;
  doctorName: string;
  dateAd: string;
  dateBs: string;
  timeHhmm: string;
  durationMin: number;
  name: string;
  phone: string;
  sex: "f" | "m" | "o";
  ageLabel: string;
  address: string;
  reason: string;
  receivedAt: string;
  matches: RequestMatch[];
}

export interface AnsweredRequest {
  id: string;
  ref: string;
  status: "pending" | "confirmed" | "declined" | "expired";
  doctorId: string;
  doctorName: string;
  name: string;
  askedDateBs: string;
  askedTime: string;
  bookedDateBs: string | null;
  bookedTime: string | null;
  patientId: string | null;
  patientNo: number | null;
  declineReason: string;
  reviewedBy: string | null;
  when: string;
  smsStatus: "" | "sent" | "failed" | "off";
  smsDetail: string;
}

const SEX_LABEL: Record<string, string> = { f: "Female", m: "Male", o: "Other" };

const STATUS: Record<AnsweredRequest["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "info" },
  confirmed: { label: "Booked", tone: "ok" },
  declined: { label: "Declined", tone: "danger" },
  expired: { label: "Not answered in time", tone: "warn" },
};

function longBs(bs: string): string {
  return formatBS(bsFromDbText(bs), { form: "long", monthScript: "en" });
}

export function WebRequests({
  pending,
  answered,
  accepting,
  smsOn,
  smsReady,
  isAdmin,
}: {
  pending: PendingRequest[];
  answered: AnsweredRequest[];
  accepting: boolean;
  smsOn: boolean;
  smsReady: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // confirming one
  const [confirming, setConfirming] = useState<PendingRequest | null>(null);
  const [patientChoice, setPatientChoice] = useState<string>("new");
  const [whenBs, setWhenBs] = useState("");
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(15);

  // declining one
  const [declining, setDeclining] = useState<PendingRequest | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  function openConfirm(r: PendingRequest) {
    setConfirming(r);
    // A phone match is a soft hint (households share numbers), so nobody is
    // chosen for the desk — but a same-name-and-phone match is offered first.
    const both = r.matches.find((m) => m.why === "Same name and phone number");
    setPatientChoice(both ? both.id : "new");
    setWhenBs(r.dateBs);
    setTime(r.timeHhmm);
    setMinutes(r.durationMin);
  }

  async function submitConfirm() {
    if (!confirming) return;
    setBusy(true);
    const res = await confirmWebRequestAction({
      id: confirming.id,
      patientId: patientChoice,
      dateBs: whenBs,
      timeHhmm: time,
      durationMin: minutes,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Booked ${confirming.name} with ${confirming.doctorName}.`);
      for (const n of res.notes ?? []) toast.info(n);
      setConfirming(null);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong. Please try again.");
    }
  }

  async function submitDecline() {
    if (!declining) return;
    setBusy(true);
    const res = await declineWebRequestAction({ id: declining.id, reason: declineReason });
    setBusy(false);
    if (res.ok) {
      toast.success("Declined. The time is free again.");
      setDeclining(null);
      setDeclineReason("");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong. Please try again.");
    }
  }

  const timeChanged =
    confirming !== null && (whenBs !== confirming.dateBs || time !== confirming.timeHhmm);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-sage-500">
          Consultations asked for on the clinic&apos;s website. Each one holds its time
          until somebody here books it or declines it.
        </p>
        {!accepting && (
          <Badge tone="warn">
            Online booking is paused{isAdmin ? "" : " — ask the owner"}
          </Badge>
        )}
      </div>

      {!accepting && isAdmin && (
        <p className="-mt-3 text-[13px] text-sage-500">
          Turn it back on in{" "}
          <Link href="/settings/online-booking" className="text-sage-700 underline">
            Settings → Online booking
          </Link>
          .
        </p>
      )}

      {/* ---- waiting ---- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-semibold text-sage-900">
          Waiting {pending.length > 0 && <span className="text-sage-500">({pending.length})</span>}
        </h2>

        {pending.length === 0 ? (
          <EmptyState
            icon={Inbox}
            message="Nothing waiting. New requests from the website appear here, and the number on the Requests tab tells you one has come in."
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-[10px] border border-line bg-cream-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-clinic-900">{r.name}</div>
                    <div className="text-[13px] text-sage-500">
                      {[SEX_LABEL[r.sex], r.ageLabel].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[12px] text-sage-500">
                    <Globe className="h-3.5 w-3.5" /> {r.ref}
                  </span>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                  <dt className="text-sage-500">Doctor</dt>
                  <dd className="text-sage-900">{r.doctorName}</dd>
                  <dt className="text-sage-500">When</dt>
                  <dd className="text-sage-900">
                    {longBs(r.dateBs)} at {formatTime(r.timeHhmm)}{" "}
                    <span className="text-sage-500">({shortAd(r.dateAd)})</span>
                  </dd>
                  <dt className="text-sage-500">Phone</dt>
                  <dd>
                    <a
                      href={`tel:${r.phone}`}
                      className="inline-flex items-center gap-1 text-sage-700 underline"
                    >
                      <Phone className="h-3.5 w-3.5" /> {r.phone}
                    </a>
                  </dd>
                  {r.address && (
                    <>
                      <dt className="text-sage-500">Address</dt>
                      <dd className="text-sage-900">{r.address}</dd>
                    </>
                  )}
                  {r.reason && (
                    <>
                      <dt className="text-sage-500">Reason</dt>
                      <dd className="text-sage-900">{r.reason}</dd>
                    </>
                  )}
                </dl>

                {r.matches.length > 0 && (
                  <p className="rounded-[8px] bg-clinic-75 px-3 py-2 text-[12px] text-clinic-700">
                    {r.matches.length === 1
                      ? "Somebody on file may be this person"
                      : `${r.matches.length} people on file may be this person`}{" "}
                    — choose when you book.
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="text-[12px] text-sage-500">Asked {r.receivedAt}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setDeclining(r)}>
                      Decline
                    </Button>
                    <Button onClick={() => openConfirm(r)}>Book it</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- answered ---- */}
      {answered.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-semibold text-sage-900">Answered</h2>
          <div className="overflow-x-auto rounded-[10px] border border-line bg-cream-50">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-sage-500">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Doctor</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">What happened</th>
                  <th className="px-3 py-2 font-medium">Text to patient</th>
                </tr>
              </thead>
              <tbody>
                {answered.map((r) => {
                  const s = STATUS[r.status];
                  const bookedBs = r.bookedDateBs ?? r.askedDateBs;
                  const bookedTime = r.bookedTime ?? r.askedTime;
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-3 py-2 font-mono text-sage-700">{r.ref}</td>
                      <td className="px-3 py-2">
                        {r.patientId ? (
                          <Link href={`/patients/${r.patientId}`} className="text-clinic-700 underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span className="text-sage-900">{r.name}</span>
                        )}
                        {r.patientNo != null && (
                          <div className="text-[12px] text-clinic-700">{formatPatientNo(r.patientNo)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sage-900">{r.doctorName}</td>
                      <td className="px-3 py-2 text-sage-900">
                        {r.status === "confirmed" ? (
                          <Link
                            href={`/doctors/${r.doctorId}?on=${bookedBs}`}
                            className="text-sage-700 underline"
                          >
                            {longBs(bookedBs)}, {formatTime(bookedTime)}
                          </Link>
                        ) : (
                          <>
                            {longBs(r.askedDateBs)}, {formatTime(r.askedTime)}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        <div className="mt-1 text-[12px] text-sage-500">
                          {[r.reviewedBy, r.when].filter(Boolean).join(" · ")}
                        </div>
                        {r.declineReason && (
                          <div className="mt-0.5 text-[12px] text-sage-600">{r.declineReason}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {r.smsStatus === "sent" ? (
                          <span className="text-ok-600">Sent</span>
                        ) : r.smsStatus === "failed" ? (
                          <span className="text-danger-600" title={r.smsDetail}>
                            Did not go
                          </span>
                        ) : r.smsStatus === "off" ? (
                          <span className="text-sage-500" title={r.smsDetail}>
                            Not sent
                          </span>
                        ) : (
                          <span className="text-sage-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- book it ---- */}
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Book ${confirming.name} with ${confirming.doctorName}` : "Book"}
        className="max-w-lg"
      >
        {confirming && (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-sage-900">Who is it?</legend>
              {confirming.matches.map((m) => (
                <label
                  key={m.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[8px] border px-3 py-2",
                    patientChoice === m.id ? "border-clinic-500 bg-clinic-75" : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="patient"
                    className="mt-1"
                    checked={patientChoice === m.id}
                    onChange={() => setPatientChoice(m.id)}
                  />
                  <span className="min-w-0 text-[14px]">
                    <span className="font-medium text-clinic-900">{m.name}</span>
                    {m.patientNo != null && (
                      <span className="ml-2 text-[12px] text-clinic-700">
                        {formatPatientNo(m.patientNo)}
                      </span>
                    )}
                    <span className="block text-[12px] text-sage-500">
                      {[m.why, m.phone, m.lastVisitBs ? `last seen ${longBs(m.lastVisitBs)}` : "never visited"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[8px] border px-3 py-2",
                  patientChoice === "new" ? "border-clinic-500 bg-clinic-75" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="patient"
                  className="mt-1"
                  checked={patientChoice === "new"}
                  onChange={() => setPatientChoice("new")}
                />
                <span className="text-[14px]">
                  <span className="font-medium text-sage-900">Someone new</span>
                  <span className="block text-[12px] text-sage-500">
                    Registers {confirming.name} with the details they gave, and the next
                    patient number.
                  </span>
                </span>
              </label>
            </fieldset>

            <Field label="When is it?" hint="Change it if you agreed another time with them on the phone.">
              <DatePickerBS value={whenBs} onChange={setWhenBs} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="At what time?">
                <TimeChooser value={time} onChange={setTime} />
              </Field>
              <Field label="How long?">
                <Select value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {DURATION_CHOICES.map((m) => (
                    <option key={m} value={m}>
                      {describeDuration(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <p className="rounded-[8px] bg-sage-75 px-3 py-2 text-[12px] text-sage-600">
              {smsOn
                ? smsReady
                  ? `${confirming.name} will get a text at ${confirming.phone} saying it is confirmed${
                      timeChanged ? ", with the new time" : ""
                    }.`
                  : "Texting the patient is switched on, but SMS sending is not set up yet, so no text will go."
                : `No text will be sent — that is switched off in Settings → Online booking.${
                    timeChanged ? " Phone them about the new time." : ""
                  }`}
            </p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button onClick={submitConfirm} disabled={busy || !whenBs || !time}>
            {busy ? "Booking…" : "Book it"}
          </Button>
        </div>
      </Dialog>

      {/* ---- decline ---- */}
      <Dialog
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title={declining ? `Decline ${declining.name}'s request` : "Decline"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-sage-600">
            The time goes back on the website. The request stays on this list as
            declined. No text is sent — phone them if they should know.
          </p>
          <Field label="Why?" hint="Optional — for the people here, not sent to the patient">
            <Input
              autoFocus
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              maxLength={300}
              placeholder="Doctor is away that day"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeclining(null)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submitDecline} disabled={busy}>
            {busy ? "Declining…" : "Decline"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
