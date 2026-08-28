import Link from "next/link";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { filesPending } from "@/lib/repos/attachments";
import { patientLabel } from "@/lib/patient-no";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Files pending" };

export default async function FilesPendingPage() {
  await requireUser();
  await requireModulePage("clinic");

  const rows = await filesPending();

  return (
    <PageShell title="Files pending">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-sage-500">
          Visits with no report or image attached yet, oldest first.
        </p>

        {rows.length === 0 ? (
          <EmptyState message="Nothing is waiting for a file. Every visit has what it needs." />
        ) : (
          <div className="rounded-[10px] border border-line bg-cream-50">
            <Table>
              <THead>
                <TR>
                  <TH>Patient</TH>
                  <TH>Date (BS)</TH>
                  <TH>What</TH>
                  <TH>Visit</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.visitId ?? r.patientId}>
                    <TD>
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium text-sage-900">
                          {r.patientName}
                        </span>
                        <span className="font-mono text-[12px] text-clinic-700">
                          {patientLabel(r.patientNo, r.patientId)}
                        </span>
                      </Link>
                    </TD>
                    <TD className="font-mono">{r.dateBs}</TD>
                    <TD className="text-sage-500">{r.what}</TD>
                    <TD>
                      {r.visitId && (
                        <Link
                          href={`/visits/${r.visitId}`}
                          className="text-[13px] text-clinic-700 hover:underline"
                        >
                          Open visit
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
