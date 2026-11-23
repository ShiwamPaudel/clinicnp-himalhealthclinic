/**
 * sms.ts — sends one text message. Server only.
 *
 * The SMS service takes a POST of `auth_token`, `to` (ten-digit mobile
 * numbers, comma separated) and `text`, and answers with
 * `{ error, message, data: { valid: [...], invalid: [...] } }`. One number is
 * sent per call here, because every reminder carries its own patient's name.
 *
 * Configuration (Deploy.md):
 *   SMS_AUTH_TOKEN  the token made in the SMS account (API Service > Token).
 *                   The account ties it to one "Allowed IP" — the address
 *                   the messages leave from.
 *   SMS_API_URL     optional; the send address, for a relay with a fixed IP.
 *
 * This function never throws. Every outcome comes back as a result, with
 * the wording for the screen already written (Rules §1c): the service's own
 * message goes to the server log, never to a screen, and the patient's number
 * goes nowhere near the log (Rules §2.7).
 */
import "server-only";

const DEFAULT_URL = "https://sms.aakashsms.com/sms/v3/send"; // sweep-ok: never rendered

/** How long to wait for the SMS service before giving up on this attempt. */
const TIMEOUT_MS = 15_000;

export type SmsResult =
  | { ok: true; providerId: string | null; credits: number | null }
  | {
      ok: false;
      /** True when trying again later could work; false when it never will. */
      retry: boolean;
      /** Plain words for the screen. */
      detail: string;
    };

/** Anything that can send a message: the real service, or a test's stand-in. */
export type SmsSender = (to: string, text: string) => Promise<SmsResult>;

export function smsConfigured(): boolean {
  return (process.env.SMS_AUTH_TOKEN ?? "").trim() !== "";
}

export const NOT_SET_UP = "SMS sending is not set up yet.";
const UNREACHABLE = "The SMS service could not be reached.";
const TURNED_DOWN =
  "The SMS service turned the message down. The SMS account may be out of credit, or not set up to accept messages from this system.";
const BAD_NUMBER = "The SMS service would not accept this number.";

interface ProviderEntry {
  id?: number | string;
  mobile?: string;
  credit?: number;
  status?: string;
}

interface ProviderAnswer {
  error?: boolean;
  message?: string;
  data?: { valid?: ProviderEntry[]; invalid?: ProviderEntry[] } | unknown[];
}

export const sendSms: SmsSender = async (to, text) => {
  const token = (process.env.SMS_AUTH_TOKEN ?? "").trim();
  if (!token) return { ok: false, retry: true, detail: NOT_SET_UP };

  const url = (process.env.SMS_API_URL ?? "").trim() || DEFAULT_URL;

  let answer: ProviderAnswer;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ auth_token: token, to, text }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = await res.text();
    try {
      answer = JSON.parse(body) as ProviderAnswer;
    } catch {
      console.error("[sms] unreadable answer", res.status, body.slice(0, 200));
      return { ok: false, retry: true, detail: UNREACHABLE };
    }
  } catch (err) {
    console.error("[sms] could not reach the service", (err as Error)?.name);
    return { ok: false, retry: true, detail: UNREACHABLE };
  }

  if (answer.error !== false) {
    // A bad token, a wrong allowed address, an empty balance: all things
    // somebody can put right, so tomorrow's run tries again.
    console.error("[sms] turned down:", String(answer.message ?? "").slice(0, 200));
    return { ok: false, retry: true, detail: TURNED_DOWN };
  }

  const data =
    answer.data && !Array.isArray(answer.data) ? answer.data : { valid: [], invalid: [] };
  const valid = data.valid ?? [];
  const invalid = data.invalid ?? [];

  if (valid.length > 0) {
    const v = valid[0]!;
    return {
      ok: true,
      providerId: v.id != null ? String(v.id) : null,
      credits: typeof v.credit === "number" ? v.credit : null,
    };
  }
  if (invalid.length > 0) {
    // The number itself was refused. Sending it again tomorrow changes nothing.
    return { ok: false, retry: false, detail: BAD_NUMBER };
  }
  console.error("[sms] accepted with no recipient:", String(answer.message ?? "").slice(0, 200));
  return { ok: false, retry: false, detail: BAD_NUMBER };
};
