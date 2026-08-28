import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { exportAll, recordBackup } from "@/lib/repos/backup";

/** GET /api/backup/download — full data backup as a JSON archive (Admin only). */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }
  const archive = await exportAll();
  const body = JSON.stringify(archive);
  await recordBackup("manual", body.length);
  const date = archive.createdAt.slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clinicnp-backup-${date}.json"`,
    },
  });
}
