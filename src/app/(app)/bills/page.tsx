import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listBills } from "@/lib/repos/bills";
import { PageShell } from "@/components/app/page-shell";
import { BillRegister } from "@/components/app/bill-register";
import { Button } from "@/components/ui/button";

export default async function BillsPage() {
  await requireUser();
  const rows = await listBills();
  return (
    <PageShell
      title="Bills"
      actions={
        <Link href="/bills/credit">
          <Button variant="secondary">
            <CreditCard className="h-4 w-4" />
            Credit bills
          </Button>
        </Link>
      }
    >
      <BillRegister rows={rows} />
    </PageShell>
  );
}
