import Link from "next/link";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { filesPending } from "@/lib/repos/clinic-reports";
import { formatPatientNo } from "@/lib/patient-no";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Files pending" };

/**
 * What was charged for and has not come back yet.
 *
 * Until Phase 3 this listed any visit with no file at all, because services
 * did not exist to ask the real question (D-052). It now means what the PRD
 * says: a billed service flagged as producing a report, with nothing attached.
 */
export default async function FilesPendingPage() {
  await requireUser();
  await requireModulePage("clinic");

  const rows = await filesPending();

  return (
    <PageShell title="Files pending">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-sage-500">
          Tests and scans that were charged for and whose report has not been
          attached yet, most recent first.
        </p>

        {rows.length === 0 ? (
          <EmptyState message="Nothing is waiting. Every report that was charged for has come back." />
        ) : (
          <div className="rounded-[10px] border border-line bg-cream-50">
            <Table>
              <THead>
                <TR>
                  <TH>Patient</TH>
                  <TH>Date (BS)</TH>
                  <TH>What is expected</TH>
                  <TH>Sent to</TH>
                  <TH> </TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.billServiceLineId}>
                    <TD>
                      <span className="flex flex-col">
                        <span className="font-medium text-sage-900">
                          {r.patientName}
                        </span>
                        {r.patientNo != null && (
                          <span className="font-mono text-[12px] text-clinic-700">
                            {formatPatientNo(r.patientNo)}
                          </span>
                        )}
                      </span>
                    </TD>
                    <TD className="font-mono">{r.dateBs}</TD>
                    <TD className="text-sage-900">{r.serviceName}</TD>
                    <TD className="text-sage-500">
                      {r.partnerName ? (
                        <span className="flex items-center gap-2">
                          {r.partnerName}
                          {r.dispatchedAt && <Badge tone="neutral">Sent</Badge>}
                        </span>
                      ) : (
                        "Done here"
                      )}
                    </TD>
                    <TD>
                      {r.visitId ? (
                        <Link
                          href={`/visits/${r.visitId}`}
                          className="text-[13px] text-clinic-700 hover:underline"
                        >
                          Open visit to attach
                        </Link>
                      ) : (
                        <span className="text-[13px] text-sage-400">
                          No visit
                        </span>
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
