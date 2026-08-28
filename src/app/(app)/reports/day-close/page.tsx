import { requireUser } from "@/lib/session";
import { daySummary } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";

export default async function DayClosePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const range = resolveRange({ preset: sp.preset ?? "today", from: sp.from, to: sp.to });
  const day = range.toIso; // day-close is a single day
  const summary = await daySummary(day);
  const dayBs = formatBS(toBS(adFromIso(day)), { form: "long", monthScript: "en" });

  return (
    <ReportFrame title="Day-close" rangeLabel={dayBs} preset={range.preset}>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-sage-900">Sales</h2>
          <Line label="Bills issued" value={String(summary.billCount)} />
          <Line label="Gross sales" value={formatPaisa(summary.grossSalesPaisa)} />
          <Line label="Discounts" value={formatPaisa(summary.billDiscountPaisa)} />
          <Line label="Returns" value={`− ${formatPaisa(summary.returnsPaisa, false)}`} />
          <div className="mt-2 border-t border-line pt-2 text-[16px] font-semibold">
            <Line label="Net sales" value={formatPaisa(summary.netSalesPaisa)} />
          </div>
        </div>

        <div className="rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
            By payment method
          </h2>
          <Line label="Cash" value={formatPaisa(summary.byMethod.cash)} />
          <Line label="QR / wallet" value={formatPaisa(summary.byMethod.qr)} />
          <Line label="Credit" value={formatPaisa(summary.byMethod.credit)} />
          <div className="mt-3 rounded-[8px] bg-sage-75 p-3">
            <Line
              label="Expected cash in drawer"
              value={formatPaisa(summary.expectedCashPaisa)}
              bold
            />
          </div>
        </div>
      </div>
    </ReportFrame>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-[14px]">
      <span className={bold ? "font-semibold text-sage-900" : "text-sage-600"}>
        {label}
      </span>
      <span className={`tnum ${bold ? "font-semibold text-sage-900" : "text-sage-900"}`}>
        {value}
      </span>
    </div>
  );
}
