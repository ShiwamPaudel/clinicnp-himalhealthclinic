import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listBills } from "@/lib/repos/bills";
import { getModules } from "@/lib/modules";
import { PageShell } from "@/components/app/page-shell";
import { BillRegister } from "@/components/app/bill-register";
import { Button } from "@/components/ui/button";
import {
  FiscalYearBar,
  ClosedYearBanner,
  resolveFiscalYear,
} from "@/components/app/fiscal-year-bar";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const user = await requireUser();
  const { fy } = await searchParams;
  const year = await resolveFiscalYear(fy);
  const [rows, modules] = await Promise.all([
    listBills(200, year.id),
    getModules(),
  ]);
  const bothModules = modules.pharmacy && modules.clinic;

  return (
    <PageShell
      title="Bills"
      actions={
        <div className="flex items-center gap-2">
          <FiscalYearBar role={user.role} current={year.label} />
          {!year.isClosed && (
            <Link href="/bills/credit">
              <Button variant="secondary">
                <CreditCard className="h-4 w-4" />
                Credit bills
              </Button>
            </Link>
          )}
        </div>
      }
    >
      {year.isClosed && <ClosedYearBanner label={year.label} />}
      <BillRegister rows={rows} readOnly={year.isClosed} showKind={bothModules} />
    </PageShell>
  );
}
