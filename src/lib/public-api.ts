/**
 * public-api.ts — the door the clinic's website comes in by. Server only.
 *
 * The website's server (never a visitor's browser) presents the shared key
 * in `Authorization: Bearer <WEBSITE_API_KEY>`. Everything under
 * /api/public/v1 goes through `openDoor` first: the key, the Clinic module,
 * and a rate limit, in that order.
 *
 * Answers are JSON, never cached, and their messages are plain enough to show
 * to the person filling in the form. Nothing here logs a name or a number
 * (Rules §2.7).
 */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getModules } from "@/lib/modules";
import { checkRateLimit, WEBSITE_API, clientIp } from "@/lib/rate-limit";

/** Set only when the key is configured; the Settings page shows which. */
export function websiteKeyConfigured(): boolean {
  return (process.env.WEBSITE_API_KEY ?? "").trim().length >= 32;
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Does the request carry the website's key? Compared in constant time. */
export function hasWebsiteKey(req: Request): boolean {
  const key = (process.env.WEBSITE_API_KEY ?? "").trim();
  if (key.length < 32) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(key));
}

const NO_STORE = { "Cache-Control": "no-store" };

export function answer(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function refuse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return answer({ ok: false, code, message, ...extra }, status, headers);
}

/**
 * Null when the request may go on; otherwise the answer to send back.
 * A wrong key and a switched-off Clinic look the same as they always have:
 * 401 and 404, with nothing about why.
 */
export async function openDoor(req: Request): Promise<NextResponse | null> {
  if (!hasWebsiteKey(req)) {
    return refuse(401, "unauthorized", "This website is not allowed to book.");
  }
  const modules = await getModules();
  if (!modules.clinic) return refuse(404, "not_found", "Not found.");

  const limit = await checkRateLimit(WEBSITE_API, "key");
  if (!limit.ok) {
    return refuse(
      429,
      "too_busy",
      "That's a lot at once — give it a moment and try again.",
      {},
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }
  return null;
}

/**
 * The visitor's own address, which the website's server forwards in
 * `X-Visitor-IP`. Without it every visitor looks like the website itself.
 */
export function visitorIp(req: Request): string {
  const forwarded = (req.headers.get("x-visitor-ip") ?? "").trim();
  if (forwarded && forwarded.length <= 64 && /^[0-9a-fA-F:.]+$/.test(forwarded)) {
    return forwarded;
  }
  return clientIp(req);
}
