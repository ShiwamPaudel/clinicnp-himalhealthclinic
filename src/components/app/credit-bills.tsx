"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { settleCreditAction } from "@/app/(app)/bills/actions";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import type { CreditBillRow } from "@/lib/repos/bills";
import { CheckCircle2 } from "lucide-react";
import { strings } from "@/lib/strings";

export function CreditBills({ rows }: { rows: CreditBillRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function settle(id: string) {
    setBusyId(id);
    const res = await settleCreditAction(id);
    setBusyId(null);
    if (res.ok) {
      toast.success("Marked as paid");
      router.refresh();
    } else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        message="No unpaid credit bills. Everything is settled."
      />
    );
  }

  const total = rows.reduce((s, r) => s + r.totalPaisa, 0);

  return (
    <div>
      <div className="mb-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
          Total outstanding
        </div>
        <div className="text-[22px] font-bold text-warn-600 tnum">
          {formatPaisa(total)}
        </div>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Invoice</TH>
            <TH>Date</TH>
            <TH>Patient</TH>
            <TH numeric>Amount</TH>
            <TH>Age</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {rows.map((b) => (
            <TR key={b.id}>
              <TD>
                <Link
                  href={`/bills/${b.id}`}
                  className="font-mono text-sage-900 hover:text-sage-600"
                >
                  {b.invoiceNo != null
                    ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo)
                    : "Pending"}
                </Link>
              </TD>
              <TD>{b.dateBs}</TD>
              <TD>{b.patientName || "—"}</TD>
              <TD numeric>{formatPaisa(b.totalPaisa)}</TD>
              <TD>
                <Badge tone={b.ageDays > 30 ? "danger" : b.ageDays > 15 ? "warn" : "neutral"}>
                  {b.ageDays} d
                </Badge>
              </TD>
              <TD className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => settle(b.id)}
                  disabled={busyId === b.id}
                >
                  Mark paid
                </Button>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
