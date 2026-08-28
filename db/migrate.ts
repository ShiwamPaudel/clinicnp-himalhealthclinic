/**
 * migrate.ts — append-only migration runner.
 * Applies every db/migrations/*.sql in filename order that hasn't run yet.
 * Tracks applied files in a `_migrations` table. Never edit an applied migration.
 *
 * Run: pnpm db:migrate
 */
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load env from .env.local / .env if present (Node 20.12+ built-in).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");

/** Split a SQL file into individual statements. Our migrations are simple DDL
 * (no procedural bodies with embedded semicolons), so we strip line comments
 * then split on `;`. */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set (see .env.example)");

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set(
    (await client.execute("SELECT name FROM _migrations")).rows.map(
      (r) => r.name as string,
    ),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const statements = splitStatements(sql);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
      args: [file, new Date().toISOString()],
    });
    console.log(`applied ${file} (${statements.length} statements)`);
    ran++;
  }

  if (ran === 0) console.log("no new migrations");
  else console.log(`done — ${ran} migration(s) applied`);
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
