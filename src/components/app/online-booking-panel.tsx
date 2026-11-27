"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  saveOnlineBookingAction,
  sendTestConfirmSmsAction,
} from "@/app/(app)/settings/online-booking/actions";
import {
  CONFIRM_PLACEHOLDERS,
  DEFAULT_CONFIRM_SMS,
  MAX_CONFIRM_SMS,
  fillConfirmMessage,
  unknownConfirmPlaceholders,
} from "@/lib/web-booking-text";
import {
  hasCurlyQuotes,
  mobileProblem,
  smsSize,
  straightenQuotes,
} from "@/lib/sms-text";
import { cn } from "@/lib/cn";

interface Settings {
  accepting: boolean;
  confirmSmsOn: boolean;
  confirmSms: string;
}

function Switch({
  on,
  label,
  disabled,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-700 focus-visible:ring-offset-2",
        on ? "bg-sage-700" : "bg-sage-300",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-cream-50 transition-[left]",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/**
 * Settings → Online booking: whether the website may send requests, and
 * whether the patient is texted when the front desk confirms one.
 */
export function OnlineBookingPanel({
  initial,
  clinicName,
  keyReady,
  smsReady,
}: {
  initial: Settings;
  clinicName: string;
  keyReady: boolean;
  smsReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<Settings>(initial);
  const [text, setText] = useState(initial.confirmSms || DEFAULT_CONFIRM_SMS);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  const savedText = saved.confirmSms || DEFAULT_CONFIRM_SMS;
  const dirty = text !== savedText;
  const unknown = unknownConfirmPlaceholders(text);
  const curly = hasCurlyQuotes(text);
  const problem =
    text.trim() === ""
      ? "Write the message, or put the original wording back."
      : unknown.length > 0
        ? `${unknown.join(", ")} will not be filled in.`
        : null;

  const preview = fillConfirmMessage(text, {
    name: "Sita Sharma",
    doctor: "Dr. Ram Karki",
    date: "13 Mangsir 2083",
    date_ad: "29 Nov 2026",
    time: "9:00 PM",
    ref: "W7K3Q9DX",
    clinic: clinicName,
  });
  const size = smsSize(preview);

  function commit(next: Settings, done?: string) {
    const previous = saved;
    setSaved(next);
    startTransition(async () => {
      const res = await saveOnlineBookingAction(next);
      if (!res.ok) {
        setSaved(previous);
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success(done ?? "Saved");
      router.refresh();
    });
  }

  async function sendTest() {
    setTesting(true);
    const res = await sendTestConfirmSmsAction({ phone: testPhone });
    setTesting(false);
    if (res.ok) toast.success("Test text sent.");
    else toast.error(res.userMessage ?? "Something went wrong. Please try again.");
  }

  const testProblem = testPhone.trim() === "" ? null : mobileProblem(testPhone);

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-[28px] font-semibold text-sage-900">Online booking</h1>
        <p className="mt-1 text-[14px] text-sage-500">
          People can ask for a consultation on the clinic&apos;s website. Each request
          waits under Clinic → Requests until somebody here books it or declines it.
        </p>
      </header>

      <div className="flex max-w-[760px] flex-col gap-3">
        {/* ---- accepting ---- */}
        <section className="flex items-start gap-4 rounded-[10px] border border-line bg-cream-50 p-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-clinic-75 text-clinic-700">
            <Globe className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-sage-900">Take bookings from the website</div>
            <p className="mt-0.5 text-[13px] leading-[1.45] text-sage-500">
              Every doctor seeing patients is offered, 6 AM to 10 PM, from three hours
              ahead up to thirty days. Switched off, the website is told bookings are
              paused and to phone the clinic. Requests already waiting stay.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {keyReady ? (
                <Badge tone="ok">The website&apos;s key is set up</Badge>
              ) : (
                <Badge tone="warn">
                  The website&apos;s key is not set up yet — WEBSITE_API_KEY in the hosting settings
                </Badge>
              )}
            </div>
          </div>
          <Switch
            on={saved.accepting}
            label="Take bookings from the website"
            disabled={pending}
            onToggle={() =>
              commit(
                { ...saved, accepting: !saved.accepting },
                saved.accepting ? "Website bookings paused" : "Website bookings on",
              )
            }
          />
        </section>

        {/* ---- the text ---- */}
        <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-4">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-sage-75 text-sage-700">
              <MessageSquareText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-semibold text-sage-900">
                Text the patient when their booking is confirmed
              </div>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-sage-500">
                One SMS to the mobile number they gave, sent when somebody here presses
                Book it. Nothing is sent when a request is declined.
              </p>
              {!smsReady && (
                <p className="mt-2 text-[12px] text-warn-600">
                  SMS sending is not set up yet, so no text can go out even when this is on.
                </p>
              )}
            </div>
            <Switch
              on={saved.confirmSmsOn}
              label="Text the patient when their booking is confirmed"
              disabled={pending}
              onToggle={() =>
                commit(
                  { ...saved, confirmSmsOn: !saved.confirmSmsOn },
                  saved.confirmSmsOn ? "Confirmation texts off" : "Confirmation texts on",
                )
              }
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sage-900">The message</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={MAX_CONFIRM_SMS}
              className="w-full rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[14px] leading-[1.45] text-sage-950 outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
            />
          </label>
          <ul className="grid gap-x-4 gap-y-0.5 text-[12px] text-sage-500 sm:grid-cols-2">
            {CONFIRM_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <span className="font-mono text-sage-700">{`{${p.key}}`}</span> becomes {p.label}
              </li>
            ))}
          </ul>

          {curly && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-warn-100 px-3 py-2 text-[13px] text-warn-600">
              <span>Curly quotes make each message cost more than twice as much.</span>
              <Button variant="secondary" onClick={() => setText(straightenQuotes(text))}>
                Make them straight
              </Button>
            </div>
          )}
          {problem && <p className="text-[12px] text-danger-600">{problem}</p>}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sage-900">What the patient gets</span>
            <p className="whitespace-pre-wrap rounded-[8px] border border-line bg-cream-100 px-3 py-2 text-[14px] text-sage-900">
              {preview || "—"}
            </p>
            <p className="text-[12px] text-sage-500">
              {size.length} characters with these sample details ·{" "}
              {size.parts === 1 ? "1 SMS" : `${size.parts} SMS`} per booking. Long names
              make it longer.
              {size.unicode ? " Nepali letters fit 70 to an SMS instead of 160." : ""}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {text !== DEFAULT_CONFIRM_SMS && (
              <Button variant="ghost" onClick={() => setText(DEFAULT_CONFIRM_SMS)} disabled={pending}>
                Put back the original wording
              </Button>
            )}
            <Button
              onClick={() => commit({ ...saved, confirmSms: text.trim() }, "Message saved")}
              disabled={pending || !dirty || problem !== null}
            >
              {pending ? "Saving…" : "Save message"}
            </Button>
          </div>

          <div className="border-t border-line pt-4">
            <Field
              label="Send a test"
              error={testProblem ?? undefined}
              hint={
                smsReady
                  ? "Sends the saved message to this number now, for a patient called “Test”."
                  : "SMS sending is not set up yet, so a test cannot go out."
              }
            >
              <div className="flex gap-2">
                <Input
                  inputMode="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  invalid={testProblem !== null}
                  aria-label="Mobile number for the test"
                />
                <Button
                  variant="secondary"
                  onClick={sendTest}
                  disabled={testing || !smsReady || testPhone.trim() === "" || testProblem !== null}
                >
                  <Send className="h-4 w-4" />
                  {testing ? "Sending…" : "Send"}
                </Button>
              </div>
            </Field>
          </div>
        </section>
      </div>
    </>
  );
}
