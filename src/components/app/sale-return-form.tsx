"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { createSaleReturnAction } from "@/app/(app)/bills/actions";
import { ReturnNote, type ReturnNoteData } from "@/components/print/return-note";
import { formatPaisa } from "@/lib/money";
import type { PrintCompany } from "@/lib/print-types";
import { strings } from "@/lib/strings";

export interface ReturnLineData {
  billLineId: string;
  itemId: string;
  name: string;
  unitName: string;
  factorToBase: number;
  soldQty: number;
  alreadyReturnedUnits: number;
  ratePaisa: number;
  lineAmountPaisa: number;
}

export function SaleReturnForm({
  billId,
  invoiceLabel,
  company,
  dateBsLong,
  lines,
}: {
  billId: string;
  invoiceLabel: string;
  company: PrintCompany;
  dateBsLong: string;
  lines: ReturnLineData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ReturnNoteData | null>(null);

  const prepared = useMemo(() => {
    return lines
      .map((l) => {
        const max = l.soldQty - l.alreadyReturnedUnits;
        const q = Math.min(Number(qtys[l.billLineId]) || 0, max);
        const amount = l.soldQty > 0 ? Math.round((l.lineAmountPaisa * q) / l.soldQty) : 0;
        return { l, q, max, amount };
      })
      .filter((x) => x.q > 0);
  }, [lines, qtys]);

  const total = prepared.reduce((s, x) => s + x.amount, 0);

  async function submit() {
    if (prepared.length === 0) {
      toast.error("Enter a quantity to return.");
      return;
    }
    setBusy(true);
    const res = await createSaleReturnAction({
      billId,
      lines: prepared.map((x) => ({
        billLineId: x.l.billLineId,
        itemId: x.l.itemId,
        returnBaseQty: x.q * x.l.factorToBase,
        amountPaisa: x.amount,
      })),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    // print the return note
    setNote({
      company,
      returnLabel: res.returnNo ? `SR-${res.returnNo}` : "Return",
      againstInvoice: invoiceLabel,
      dateBsLong,
      lines: prepared.map((x) => ({
        name: x.l.name,
        qty: x.q,
        unitName: x.l.unitName,
        amountPaisa: x.amount,
      })),
      totalPaisa: total,
    });
    requestAnimationFrame(() => window.print());
    toast.success("Sales return saved");
    router.push(`/bills/${billId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-sage-500">
        Choose how much of each line to return. Stock goes back to the batch it
        was sold from.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Item</TH>
            <TH numeric>Sold</TH>
            <TH numeric>Returnable</TH>
            <TH numeric>Return</TH>
          </TR>
        </THead>
        <tbody>
          {lines.map((l) => {
            const max = l.soldQty - l.alreadyReturnedUnits;
            return (
              <TR key={l.billLineId}>
                <TD className="font-medium text-sage-900">{l.name}</TD>
                <TD numeric>
                  {l.soldQty} {l.unitName}
                </TD>
                <TD numeric>{max}</TD>
                <TD numeric>
                  <Input
                    numeric
                    inputMode="numeric"
                    className="w-20"
                    disabled={max <= 0}
                    value={qtys[l.billLineId] ?? ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Math.min(
                        Number(e.target.value.replace(/\D/g, "")) || 0,
                        max,
                      );
                      setQtys((q) => ({ ...q, [l.billLineId]: String(v || "") }));
                    }}
                  />
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

      <div className="flex items-center justify-end gap-4">
        <span className="text-[14px] text-sage-600">
          Refund: <span className="font-semibold text-sage-900 tnum">{formatPaisa(total)}</span>
        </span>
        <Button variant="secondary" onClick={() => router.push(`/bills/${billId}`)}>
          {strings.cancel}
        </Button>
        <Button onClick={submit} disabled={busy || total === 0}>
          {busy ? "…" : "Save return & print"}
        </Button>
      </div>

      <div className="print-area">{note && <ReturnNote data={note} />}</div>
    </div>
  );
}
