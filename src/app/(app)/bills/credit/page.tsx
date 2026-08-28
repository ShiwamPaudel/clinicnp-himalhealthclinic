import { requireUser } from "@/lib/session";
import { listCreditBills } from "@/lib/repos/bills";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { CreditBills } from "@/components/app/credit-bills";

export default async function CreditBillsPage() {
  await requireUser();
  const rows = await listCreditBills(adToIso(new Date()));
  return (
    <PageShell title="Credit bills">
      <CreditBills rows={rows} />
    </PageShell>
  );
}
