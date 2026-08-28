/**
 * cbms.ts — the IRD CBMS transmission queue. v1 ships the queue, retry, and
 * status fully built; it transmits only when enabled in Settings and an endpoint
 * is configured (Architecture §2.4). No IRD endpoint or schema is fabricated.
 */
import "server-only";
import { db } from "@/lib/db";

const MAX_ATTEMPTS = 10;

export interface CbmsCounts {
  pending: number;
  sent: number;
  failed: number;
}

export async function cbmsCounts(): Promise<CbmsCounts> {
  const res = await db().execute(
    `SELECT status, COUNT(*) AS n FROM cbms_queue GROUP BY status`,
  );
  const counts: CbmsCounts = { pending: 0, sent: 0, failed: 0 };
  for (const r of res.rows) {
    const s = r.status as keyof CbmsCounts;
    if (s in counts) counts[s] = Number(r.n);
  }
  return counts;
}

export interface DrainResult {
  attempted: number;
  sent: number;
  stillPending: number;
  transmitted: boolean;
}

/**
 * Drain pending rows. When `enabled` is false or no endpoint is set, this is a
 * no-op (records are kept, nothing transmitted). Otherwise each payload is POSTed;
 * success marks `sent`, failure increments attempts (marked `failed` after the cap).
 */
export async function drainCbms(opts: {
  enabled: boolean;
  endpoint: string;
  username: string;
  password: string;
}): Promise<DrainResult> {
  const pending = await db().execute(
    `SELECT bill_id, payload_json, attempts FROM cbms_queue
     WHERE status = 'pending' ORDER BY updated_at ASC LIMIT 50`,
  );
  const rows = pending.rows;

  if (!opts.enabled || !opts.endpoint) {
    return {
      attempted: 0,
      sent: 0,
      stillPending: rows.length,
      transmitted: false,
    };
  }

  let sent = 0;
  for (const r of rows) {
    const billId = r.bill_id as string;
    const payload = r.payload_json as string;
    const attempts = Number(r.attempts);
    try {
      const auth =
        opts.username || opts.password
          ? "Basic " +
            Buffer.from(`${opts.username}:${opts.password}`).toString("base64")
          : "";
      const res = await fetch(opts.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: auth } : {}),
        },
        body: payload,
      });
      if (res.ok) {
        await db().execute({
          sql: "UPDATE cbms_queue SET status = 'sent', updated_at = ? WHERE bill_id = ?",
          args: [new Date().toISOString(), billId],
        });
        sent++;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      const nextAttempts = attempts + 1;
      const status = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await db().execute({
        sql: "UPDATE cbms_queue SET attempts = ?, last_error = ?, status = ?, updated_at = ? WHERE bill_id = ?",
        args: [
          nextAttempts,
          err instanceof Error ? err.message : "error",
          status,
          new Date().toISOString(),
          billId,
        ],
      });
    }
  }

  const still = await db().execute(
    "SELECT COUNT(*) AS n FROM cbms_queue WHERE status = 'pending'",
  );
  return {
    attempted: rows.length,
    sent,
    stillPending: Number(still.rows[0]!.n),
    transmitted: true,
  };
}
