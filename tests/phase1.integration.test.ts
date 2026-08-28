/**
 * Phase 1 acceptance: the module boundary, fiscal-year status, and the
 * in-database rate limiter. Driven against an isolated file database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// A unique file per run: on Windows a previous run's client can still hold
// the old file, and reusing the name is what made this suite flaky.
const DB_FILE = join(__dirname, `phase1-verify.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});
beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    "INSERT INTO company (id, updated_at) VALUES (1, '2026-08-28T00:00:00Z')",
  );
  raw.close();
});

describe("Phase 1 — module flags", () => {
  it("defaults to the v1 shape: pharmacy on, clinic off", async () => {
    const { getModuleFlags } = await import("@/lib/repos/company");
    expect(await getModuleFlags()).toEqual({ pharmacy: true, clinic: false });
  });

  it("round-trips both switches", async () => {
    const { getModuleFlags, setModuleFlags } = await import("@/lib/repos/company");
    await setModuleFlags({ pharmacy: true, clinic: true });
    expect(await getModuleFlags()).toEqual({ pharmacy: true, clinic: true });
    await setModuleFlags({ pharmacy: false, clinic: true });
    expect(await getModuleFlags()).toEqual({ pharmacy: false, clinic: true });
    await setModuleFlags({ pharmacy: true, clinic: true });
  });

  it("refuses to leave every module off", async () => {
    const { isLastModuleOn, LAST_MODULE_MESSAGE } = await import("@/lib/modules");
    expect(isLastModuleOn({ pharmacy: false, clinic: false })).toBe(true);
    expect(isLastModuleOn({ pharmacy: true, clinic: false })).toBe(false);
    expect(isLastModuleOn({ pharmacy: false, clinic: true })).toBe(false);
    expect(LAST_MODULE_MESSAGE).toMatch(/at least one/i);
  });

  it("names no module and no backend words when a module is off", async () => {
    const { ModuleDisabledError } = await import("@/lib/modules");
    const err = new ModuleDisabledError();
    expect(err.userMessage).toBe("That page isn't available.");
    expect(err.userMessage).not.toMatch(/clinic|pharmacy|module|disabled|403/i);
  });
});

describe("Phase 1 — fiscal year status", () => {
  it("allows only one open year at a time", async () => {
    const { db } = await import("@/lib/db");
    await db().execute(
      "INSERT INTO fiscal_years (bs_label, start_ad, end_ad, status) VALUES ('2083/84','2026-07-17','2027-07-16','open')",
    );
    await expect(
      db().execute(
        "INSERT INTO fiscal_years (bs_label, start_ad, end_ad, status) VALUES ('2084/85','2027-07-17','2028-07-15','open')",
      ),
    ).rejects.toThrow();
    // a closed year alongside it is fine
    await db().execute(
      "INSERT INTO fiscal_years (bs_label, start_ad, end_ad, status) VALUES ('2082/83','2025-07-17','2026-07-16','closed')",
    );
    const rows = await db().execute(
      "SELECT COUNT(*) AS n FROM fiscal_years WHERE status = 'open'",
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
  });

  it("seeds the lifetime patient counter, which no year close touches", async () => {
    const { db } = await import("@/lib/db");
    const r = await db().execute(
      "SELECT next_value FROM counters WHERE name = 'patient_no'",
    );
    expect(Number(r.rows[0]!.next_value)).toBe(1);
  });
});

describe("Phase 1 — rate limiting (our own database, no third party)", () => {
  it("allows up to the limit, then refuses", async () => {
    const { hitBucket } = await import("@/lib/repos/rate-limit");
    const expires = Math.floor(Date.now() / 1000) + 60;
    let last;
    for (let i = 0; i < 3; i++) last = await hitBucket("t:a:1", 3, expires);
    expect(last!.ok).toBe(true);
    expect(last!.hits).toBe(3);

    const over = await hitBucket("t:a:1", 3, expires);
    expect(over.ok).toBe(false);
    expect(over.hits).toBe(4);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each identity separately", async () => {
    const { hitBucket } = await import("@/lib/repos/rate-limit");
    const expires = Math.floor(Date.now() / 1000) + 60;
    const other = await hitBucket("t:b:1", 3, expires);
    expect(other.ok).toBe(true);
    expect(other.hits).toBe(1);
  });

  it("gives each window a fresh count", async () => {
    const { hitBucket } = await import("@/lib/repos/rate-limit");
    const expires = Math.floor(Date.now() / 1000) + 60;
    const nextWindow = await hitBucket("t:a:2", 3, expires);
    expect(nextWindow.hits).toBe(1);
    expect(nextWindow.ok).toBe(true);
  });

  it("sweeps windows that have already ended", async () => {
    const { hitBucket, sweepExpired } = await import("@/lib/repos/rate-limit");
    const now = Math.floor(Date.now() / 1000);
    await hitBucket("t:stale:0", 10, now - 120);
    const removed = await sweepExpired(now);
    expect(removed).toBeGreaterThanOrEqual(1);
    const { db } = await import("@/lib/db");
    const left = await db().execute(
      "SELECT COUNT(*) AS n FROM rate_limits WHERE bucket = 't:stale:0'",
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });

  it("says nothing technical when it refuses", async () => {
    const { tooManyRequestsBody } = await import("@/lib/rate-limit");
    const body = tooManyRequestsBody();
    expect(body.userMessage).not.toMatch(
      /rate|limit|bucket|window|429|throttle|quota/i,
    );
  });
});
