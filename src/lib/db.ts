/**
 * db.ts — the single libSQL client. Server-only.
 * The client (browser) never talks to Turso directly (Rules.md §6, Architecture §6).
 */
import { createClient, type Client, type Transaction } from "@libsql/client";

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }
  client = createClient({
    url,
    // authToken is required for remote Turso; unused for file: URLs in dev.
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}

function isBusy(err: unknown): boolean {
  const e = err as { code?: unknown; rawCode?: unknown; message?: unknown } | null;
  return (
    e?.code === "SQLITE_BUSY" ||
    e?.rawCode === 5 ||
    /SQLITE_BUSY|database is locked/i.test(String(e?.message ?? ""))
  );
}

/**
 * Run `work` in one write transaction, commit it, and always close it.
 *
 * Two write transactions cannot be open at once. The second one is told the
 * database is busy rather than made to wait, so it is tried again after a
 * short, growing pause — about two seconds in all before giving up. Anything
 * `work` throws that is not "busy" (a clash, a validation error) rolls back
 * and goes straight to the caller.
 *
 * Used where two strangers can race for the same thing: a consultation slot
 * (C-029).
 */
export async function writeTransaction<T>(
  work: (tx: Transaction) => Promise<T>,
  attempts = 8,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    let tx: Transaction | null = null;
    try {
      tx = await db().transaction("write");
      const out = await work(tx);
      await tx.commit();
      return out;
    } catch (err) {
      if (tx) {
        try {
          await tx.rollback();
        } catch {
          // already unwound
        }
      }
      if (!isBusy(err)) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 20 * 2 ** i + Math.random() * 20));
    } finally {
      try {
        tx?.close();
      } catch {
        // already closed
      }
    }
  }
  throw last;
}

/** Test-only: drop the cached client so a new TURSO_DATABASE_URL takes effect. */
export function __resetDbForTests(): void {
  client = null;
}

export type {
  Client,
  InArgs,
  InValue,
  InStatement,
  Row,
} from "@libsql/client";
