"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  saveSharedMessageAction,
  sendTestSmsAction,
} from "@/app/(app)/reminders/actions";
import {
  DEFAULT_SMS_MESSAGE,
  MAX_SMS_MESSAGE,
  SMS_PLACEHOLDERS,
  hasCurlyQuotes,
  mobileProblem,
  straightenQuotes,
  unknownPlaceholders,
} from "@/lib/sms-text";
import { MessagePreview } from "@/components/app/reminder-list";
import { strings } from "@/lib/strings";

/**
 * The message every reminder sends unless it has its own, and a button that
 * sends it to one number now. Owner only.
 */
export function SmsMessagePanel({
  stored,
  clinicName,
  sampleDateBs,
  configured,
}: {
  /** What the clinic saved, or "" when the built-in wording is in use. */
  stored: string;
  clinicName: string;
  sampleDateBs: string;
  configured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(stored || DEFAULT_SMS_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);

  const saved = stored || DEFAULT_SMS_MESSAGE;
  const dirty = text !== saved;
  const unknown = unknownPlaceholders(text);
  const curly = hasCurlyQuotes(text);
  const problem =
    text.trim() === ""
      ? "Write the message, or put the original wording back."
      : unknown.length > 0
        ? `${unknown.join(", ")} will not be filled in. Use {name}, {date} or {clinic}.`
        : null;

  async function save(next: string) {
    setBusy(true);
    // The original wording is saved as nothing, so it stays the original.
    const res = await saveSharedMessageAction({
      message: next === DEFAULT_SMS_MESSAGE ? "" : next,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.saved);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function sendTest() {
    setTesting(true);
    const res = await sendTestSmsAction({ phone: testPhone });
    setTesting(false);
    if (res.ok) {
      toast.success(strings.testSmsSent);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      router.refresh();
    }
  }

  const testProblem = testPhone.trim() === "" ? null : mobileProblem(testPhone);

  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-4">
      <div>
        <h2 className="text-[15px] font-semibold text-sage-900">{strings.sharedMessage}</h2>
        <p className="mt-0.5 text-[13px] text-sage-500">
          Every reminder sends this, unless it has a message of its own.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">{strings.sharedMessage}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          maxLength={MAX_SMS_MESSAGE}
          className="w-full rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[14px] leading-[1.45] text-sage-950 outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
        />
      </label>
      <ul className="flex flex-col gap-0.5 text-[12px] text-sage-500">
        {SMS_PLACEHOLDERS.map((p) => (
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

      <MessagePreview
        template={text}
        name="Sita Sharma"
        dateBs={sampleDateBs}
        clinic={clinicName}
      />

      <div className="flex flex-wrap justify-end gap-2">
        {text !== DEFAULT_SMS_MESSAGE && (
          <Button variant="ghost" onClick={() => setText(DEFAULT_SMS_MESSAGE)} disabled={busy}>
            Put back the original wording
          </Button>
        )}
        <Button onClick={() => save(text)} disabled={busy || !dirty || problem !== null}>
          {busy ? "Saving…" : "Save message"}
        </Button>
      </div>

      <div className="border-t border-line pt-4">
        <Field
          label={strings.sendTestSms}
          error={testProblem ?? undefined}
          hint={
            configured
              ? "Sends the saved message to this number now, with “Test” as the name."
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
              disabled={testing || !configured || testPhone.trim() === "" || testProblem !== null}
            >
              <Send className="h-4 w-4" />
              {testing ? "Sending…" : "Send"}
            </Button>
          </div>
        </Field>
      </div>
    </section>
  );
}
