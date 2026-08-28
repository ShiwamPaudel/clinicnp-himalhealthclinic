/**
 * backup.ts — logical data backup & restore.
 *
 * NOTE (D-012): Architecture §2.5 describes a Turso branch-swap restore. That
 * needs the Turso platform API, which isn't wired here, so v1 implements a
 * logical JSON export/import: a full dump that restores by replacing all data
 * inside one transaction. Same guarantees for the shop's data; simpler ops.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";

// Parent → child order for inserts; deletes run in reverse.
const TABLES = [
  "company",
  "fiscal_years",
  "users",
  "suppliers",
  "items",
  "item_units",
  "purchases",
  "batches",
  "purchase_lines",
  "purchase_returns",
  "purchase_return_lines",
  "supplier_payments",
  "bills",
  "bill_lines",
  "bill_line_batches",
  "sale_returns",
  "sale_return_lines",
  "audit_log",
] as const;

export interface BackupArchive {
  version: 1;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportAll(): Promise<BackupArchive> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    const res = await db().execute(`SELECT * FROM ${t}`);
    tables[t] = res.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of res.columns) obj[col] = (row as Record<string, unknown>)[col];
      return obj;
    });
  }
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

export async function restoreAll(archive: BackupArchive): Promise<void> {
  if (archive.version !== 1) throw new Error("unsupported backup version");
  const tx = await db().transaction("write");
  try {
    // Defer FK checks to COMMIT so the full replace is validated only against
    // the final, consistent snapshot (not intermediate delete/insert states).
    await tx.execute("PRAGMA defer_foreign_keys = ON");
    // clear existing data
    for (const t of [...TABLES].reverse()) {
      await tx.execute(`DELETE FROM ${t}`);
    }
    // insert from the snapshot
    for (const t of TABLES) {
      const rows = archive.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => "?").join(", ");
        await tx.execute({
          sql: `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${placeholders})`,
          args: cols.map((c) => row[c] as never),
        });
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export interface BackupRecord {
  id: string;
  kind: string;
  size: number;
  createdAt: string;
}

export async function listBackups(): Promise<BackupRecord[]> {
  const res = await db().execute(
    "SELECT * FROM backups ORDER BY created_at DESC LIMIT 50",
  );
  return res.rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    size: Number(r.size),
    createdAt: r.created_at as string,
  }));
}

export async function recordBackup(kind: "daily" | "manual", size: number) {
  await db().execute({
    sql: `INSERT INTO backups (id, kind, blob_url, size, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [ulid(), kind, "download", size, new Date().toISOString()],
  });
}
