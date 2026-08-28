import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { nearExpiryBatches } from "@/lib/repos/batches";
import { getCompany } from "@/lib/repos/company";
import { adToIso, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ExpiryReportPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const todayIso = adToIso(new Date());
  const company = await getCompany();
  const windowIso = adToIso(
    new Date(Date.now() + company.expiryAlertDays * 86400000),
  );
  const [items, batches] = await Promise.all([
    listItems(true),
    nearExpiryBatches(todayIso, windowIso),
  ]);
  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));
  const atRisk = batches.reduce(
    (s, b) => s + b.remainingBaseQty * b.costPaisaPerBase,
    0,
  );

  return (
    <ReportFrame
      showFiscalYear={false}
      title="Expiry report"
      rangeLabel={`Next ${company.expiryAlertDays} days`}
      showRange={false}
    >
      <div className="mb-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
          Cost value at risk
        </div>
        <div className="mt-1 text-[22px] font-bold text-danger-600 tnum">
          {formatPaisa(atRisk)}
        </div>
      </div>
      {batches.length === 0 ? (
        <EmptyState message="Nothing is expiring soon." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH>Remaining</TH>
              <TH numeric>Cost at risk</TH>
            </TR>
          </THead>
          <tbody>
            {batches.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium text-sage-900">{b.brandName}</TD>
                <TD className="font-mono">{b.batchNo}</TD>
                <TD>{formatBS(toBS(adFromIso(b.expiryDateAd)), { form: "long", monthScript: "en" })}</TD>
                <TD>{toMixedDisplay(b.remainingBaseQty, unitsByItem.get(b.itemId) ?? [])}</TD>
                <TD numeric>{formatPaisa(b.remainingBaseQty * b.costPaisaPerBase, false)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </ReportFrame>
  );
}
