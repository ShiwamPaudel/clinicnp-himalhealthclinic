"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import type { BillListRow } from "@/lib/repos/bills";
import { ReceiptText } from "lucide-react";

function label(b: BillListRow): string {
  return b.invoiceNo != null
    ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo)
    : "Pending";
}

const METHOD: Record<string, string> = { cash: "Cash", qr: "QR", credit: "Credit" };

export function BillRegister({ rows }: { rows: BillListRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((b) => {
      return (
        label(b).toLowerCase().includes(query) ||
        b.dateBs.includes(query) ||
        b.patientName.toLowerCase().includes(query) ||
        String(b.totalPaisa / 100).includes(query)
      );
    });
  }, [rows, q]);

  return (
    <div>
      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search invoice no., date, patient, amount…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={ReceiptText} message="No bills match. Try a different search." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Date</TH>
              <TH>Patient</TH>
              <TH>Payment</TH>
              <TH numeric>Total</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {filtered.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/bills/${b.id}`}
                    className="font-mono text-sage-900 hover:text-sage-600"
                  >
                    {label(b)}
                  </Link>
                </TD>
                <TD>{b.dateBs}</TD>
                <TD>{b.patientName || "—"}</TD>
                <TD>{METHOD[b.paymentMethod] ?? b.paymentMethod}</TD>
                <TD numeric>{formatPaisa(b.totalPaisa)}</TD>
                <TD>
                  {b.status === "cancelled" ? (
                    <Badge tone="danger">Cancelled</Badge>
                  ) : b.paymentMethod === "credit" ? (
                    <Badge tone="warn">Credit</Badge>
                  ) : (
                    <Badge tone="ok">Saved</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
