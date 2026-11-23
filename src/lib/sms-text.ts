/**
 * sms-text.ts — the words of a reminder and the number it goes to.
 *
 * Pure: no database, no network, safe in the browser. The form uses it to
 * show what a message will say and what it will cost before anything is
 * saved, and the scheduled run uses the same functions to write the message
 * that actually goes out — so the preview cannot disagree with the send.
 */

/**
 * What goes out when the clinic has not written its own message — the
 * owner's Nepali wording (C-028), kept to one SMS: Nepali script fits 70 to
 * a message and the owner wants under 65. Unsigned, so no clinic's name is
 * built in; a clinic signs its own shared message (Himal's ends with
 * "हिमाल हेल्थ क्लिनिक" on its own line — 68 characters, one SMS).
 * The owner dropped "Namaste {name} Ji" — it cost a whole second SMS.
 * Once a message has any Nepali letter, English letters cost the same as
 * Nepali ones, so a signature in English saves nothing.
 */
export const DEFAULT_SMS_MESSAGE =
  "तपाईंको मासिक औषधि तयार छ। डेलिभरी वा लिन फोन गर्नुहोस्।";

/** The longest message anybody may write, before it is filled in. */
export const MAX_SMS_MESSAGE = 600;

/** What may be written in braces, and what it becomes. */
export const SMS_PLACEHOLDERS = [
  { key: "name", label: "the patient's name" },
  { key: "date", label: "the day it is sent, e.g. 10 Poush 2083" },
  { key: "clinic", label: "the clinic's name" },
] as const;

export type SmsPlaceholder = (typeof SMS_PLACEHOLDERS)[number]["key"];

const KNOWN = new Set<string>(SMS_PLACEHOLDERS.map((p) => p.key));

/** Put the patient's name, the date and the clinic into a message. */
export function fillMessage(
  template: string,
  values: Record<SmsPlaceholder, string>,
): string {
  return template
    .replace(/\{\s*([a-zA-Z]+)\s*\}/g, (whole, key: string) => {
      const k = key.toLowerCase();
      return KNOWN.has(k) ? values[k as SmsPlaceholder] : whole;
    })
    .trim();
}

/** Anything in braces the software will not fill in — almost always a typo. */
export function unknownPlaceholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{([^{}]*)\}/g)) {
    const k = (m[1] ?? "").trim().toLowerCase();
    if (!KNOWN.has(k) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// How many messages one reminder costs
// ---------------------------------------------------------------------------

/**
 * The characters a phone network carries at 160 to a message. Anything
 * outside them — Nepali script, most emoji, curly quotes — makes the whole
 * message travel the other way, at 70 to a message.
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** Carried too, but each one takes the room of two. */
const GSM_EXTENDED = "^{}\\[~]|€";

export interface SmsSize {
  /** Characters, as the network counts them. */
  length: number;
  /** How many messages it is sent as. */
  parts: number;
  /** True when it holds characters (Nepali script, emoji) that halve the room. */
  unicode: boolean;
}

export function smsSize(text: string): SmsSize {
  let gsmLength = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmLength += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    // UTF-16 units: an emoji is two of them, and so it is to the network.
    const length = text.length;
    return { length, parts: length <= 70 ? 1 : Math.ceil(length / 67), unicode };
  }
  return {
    length: gsmLength,
    parts: gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153),
    unicode,
  };
}

/**
 * Word processors and phones type curly quotes, and one of them makes a
 * message cost more than twice as much. True when a message has any.
 */
export function hasCurlyQuotes(text: string): boolean {
  return /[‘’‚‛“”„′″]/.test(text);
}

/** The same message with every curly quote made straight. */
export function straightenQuotes(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„″]/g, '"');
}

// ---------------------------------------------------------------------------
// The number
// ---------------------------------------------------------------------------

/**
 * A mobile number as the SMS service wants it: ten digits, no country code.
 * Spaces, dashes and a leading +977 are what people type and are dropped.
 */
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("977") && digits.length === 13) digits = digits.slice(3);
  return digits;
}

/** Nepali mobile numbers are ten digits starting with 9. Landlines get no SMS. */
export function isNepaliMobile(normalized: string): boolean {
  return /^9\d{9}$/.test(normalized);
}

/** The message under the phone box when the number will not do, or null. */
export function mobileProblem(raw: string): string | null {
  const n = normalizeMobile(raw);
  if (n === "") return "Enter a mobile number — reminders go out by SMS.";
  if (!/^\d+$/.test(n)) return "A phone number is digits only.";
  if (!isNepaliMobile(n)) {
    return "Enter a 10-digit mobile number starting with 9. A landline cannot get an SMS.";
  }
  return null;
}
