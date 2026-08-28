import { listAudit } from "@/lib/repos/audit";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

const ACTION_LABEL: Record<string, string> = {
  bill_cancelled: "Bill cancelled",
  restore: "Data restored",
  rate_override: "Rate edited",
};

export default async function AuditPage() {
  const entries = await listAudit();
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      {entries.length === 0 ? (
        <EmptyState message="Nothing here yet. Sensitive actions will be listed here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Detail</TH>
            </TR>
          </THead>
          <tbody>
            {entries.map((e) => (
              <TR key={e.id}>
                <TD>
                  {formatBS(toBS(adFromIso(e.at.slice(0, 10))), {
                    form: "long",
                    monthScript: "en",
                  })}
                </TD>
                <TD className="font-medium text-sage-900">{e.userName}</TD>
                <TD>{ACTION_LABEL[e.action] ?? e.action}</TD>
                <TD className="font-mono text-[12px] text-sage-500">{e.detail}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
