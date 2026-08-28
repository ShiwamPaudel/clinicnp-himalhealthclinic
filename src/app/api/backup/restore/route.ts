import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { restoreAll, type BackupArchive } from "@/lib/repos/backup";
import { recordAudit } from "@/lib/repos/audit";

/**
 * POST /api/backup/restore — replace all data from an uploaded archive (Admin).
 * Requires the typed confirmation phrase; the action is audit-logged.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  let body: { confirm?: string; archive?: BackupArchive };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't read the backup file." },
      { status: 400 },
    );
  }

  if (body.confirm !== "RESTORE") {
    return NextResponse.json(
      { ok: false, userMessage: "Type RESTORE to confirm." },
      { status: 400 },
    );
  }
  if (!body.archive || body.archive.version !== 1 || !body.archive.tables) {
    return NextResponse.json(
      { ok: false, userMessage: "That doesn't look like a valid backup file." },
      { status: 400 },
    );
  }

  try {
    await restoreAll(body.archive);
    await recordAudit(session.user.id, "restore", {
      backupCreatedAt: body.archive.createdAt,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[backup/restore]", err);
    return NextResponse.json(
      { ok: false, userMessage: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
