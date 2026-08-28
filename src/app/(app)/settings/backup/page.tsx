import { listBackups } from "@/lib/repos/backup";
import { BackupPanel } from "@/components/app/backup-panel";

export default async function BackupPage() {
  const backups = await listBackups();
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <BackupPanel backups={backups} />
    </main>
  );
}
