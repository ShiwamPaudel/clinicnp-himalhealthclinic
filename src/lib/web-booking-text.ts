/**
 * web-booking-text.ts — the text a patient gets when the front desk confirms
 * the consultation they asked for on the website.
 *
 * Pure: safe in the browser. Settings → Online booking uses it to preview the
 * message and what it costs, and the confirm action uses the same function to
 * write the message that goes out, so the preview cannot disagree with the send.
 *
 * Sizing and the mobile number come from `lib/sms-text.ts`, the same rules the
 * monthly reminders use.
 */

/** English, as the owner asked (C-029). Straight quotes and a plain hyphen. */
export const DEFAULT_CONFIRM_SMS =
  "Dear {name}, your appointment with {doctor} on {date} at {time} is confirmed. - {clinic}";

export const MAX_CONFIRM_SMS = 600;

export const CONFIRM_PLACEHOLDERS = [
  { key: "name", label: "the patient's name" },
  { key: "doctor", label: "the doctor's name" },
  { key: "date", label: "the Nepali date, e.g. 13 Mangsir 2083" },
  { key: "date_ad", label: "the English date, e.g. 29 Nov 2026" },
  { key: "time", label: "the time, e.g. 9:00 PM" },
  { key: "ref", label: "the booking code, e.g. W7K3Q9DX" },
  { key: "clinic", label: "the clinic's name" },
] as const;

export type ConfirmPlaceholder = (typeof CONFIRM_PLACEHOLDERS)[number]["key"];

const KNOWN = new Set<string>(CONFIRM_PLACEHOLDERS.map((p) => p.key));

export function fillConfirmMessage(
  template: string,
  values: Record<ConfirmPlaceholder, string>,
): string {
  return template
    .replace(/\{\s*([a-zA-Z_]+)\s*\}/g, (whole, key: string) => {
      const k = key.toLowerCase();
      return KNOWN.has(k) ? values[k as ConfirmPlaceholder] : whole;
    })
    .trim();
}

/** Anything in braces that will not be filled in — almost always a typo. */
export function unknownConfirmPlaceholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{([^{}]*)\}/g)) {
    const k = (m[1] ?? "").trim().toLowerCase();
    if (!KNOWN.has(k) && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-11-29" -> "29 Nov 2026". */
export function shortAd(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_EN[m - 1] ?? ""} ${y}`;
}
