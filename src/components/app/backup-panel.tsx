"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { BackupRecord } from "@/lib/repos/backup";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { strings } from "@/lib/strings";

export function BackupPanel({ backups }: { backups: BackupRecord[] }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState("");
  const [archiveText, setArchiveText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setArchiveText(String(reader.result));
    reader.readAsText(file);
  }

  async function restore() {
    if (!archiveText) {
      toast.error("Choose a backup file first.");
      return;
    }
    let archive: unknown;
    try {
      archive = JSON.parse(archiveText);
    } catch {
      toast.error("That file couldn't be read.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm, archive }),
    });
    setBusy(false);
    const data = await res.json();
    if (data.ok) {
      toast.success("Data restored");
      setConfirm("");
      setArchiveText(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      toast.error(data.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <h2 className="text-[16px] font-semibold text-sage-900">Back up your data</h2>
        <p className="mt-1 max-w-md text-[13px] text-sage-500">
          Download a full copy of everything — items, stock, bills, and settings —
          as a single file you can keep safe.
        </p>
        <a href="/api/backup/download" className="mt-3 inline-block">
          <Button>
            <Download className="h-4 w-4" />
            Back up now
          </Button>
        </a>
      </div>

      <div className="rounded-[10px] border border-danger-600/40 bg-cream-50 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-danger-600" />
          <h2 className="text-[16px] font-semibold text-sage-900">
            Restore from a backup
          </h2>
        </div>
        <p className="mt-1 max-w-md text-[13px] text-sage-500">
          This replaces <b>all</b> current data with the backup file. It can't be
          undone. Type <b>RESTORE</b> to confirm.
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:max-w-md">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="text-[13px] text-sage-700 file:mr-3 file:rounded-[8px] file:border file:border-line file:bg-cream-100 file:px-3 file:py-1.5 file:text-sage-900"
          />
          {fileName && (
            <p className="text-[12px] text-sage-500">Selected: {fileName}</p>
          )}
          <Input
            placeholder="Type RESTORE"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            variant="destructive"
            onClick={restore}
            disabled={busy || confirm !== "RESTORE" || !archiveText}
          >
            <Upload className="h-4 w-4" />
            Restore data
          </Button>
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
          Recent backups
        </h2>
        {backups.length === 0 ? (
          <p className="text-[14px] text-sage-500">
            No backups yet. Use “Back up now” to make your first one.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {backups.map((b) => (
              <li key={b.id} className="flex justify-between text-sage-700">
                <span>
                  {formatBS(toBS(adFromIso(b.createdAt.slice(0, 10))), {
                    form: "long",
                    monthScript: "en",
                  })}{" "}
                  · {b.kind === "daily" ? "Automatic" : "Manual"}
                </span>
                <span className="tnum text-sage-500">
                  {(b.size / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
