"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { createPurchaseAction } from "@/app/(app)/purchases/actions";
import { toPaisa, formatPaisa, vatOf } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import type { Item } from "@/lib/repos/items";
import type { Supplier } from "@/lib/repos/suppliers";
import { strings } from "@/lib/strings";

interface LineState {
  itemId: string;
  unitLevel: number;
  batchNo: string;
  mfgDateBs: string;
  expiryDateBs: string;
  qty: string;
  freeQty: string;
  costRupees: string;
  discountRupees: string;
}

function blankLine(): LineState {
  return {
    itemId: "",
    unitLevel: 0,
    batchNo: "",
    mfgDateBs: "",
    expiryDateBs: "",
    qty: "1",
    freeQty: "0",
    costRupees: "0",
    discountRupees: "0",
  };
}

export function PurchaseForm({
  items,
  suppliers,
}: {
  items: Item[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [applyVat, setApplyVat] = useState(false);
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [showBonus, setShowBonus] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onItemChange(i: number, itemId: string) {
    const item = itemsById.get(itemId);
    // default to the largest unit (usual purchase unit)
    const topLevel = item
      ? Math.max(...item.units.map((u) => u.level))
      : 0;
    setLine(i, { itemId, unitLevel: topLevel });
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const l of lines) {
      const qty = Number(l.qty) || 0;
      const cost = toPaisa(Number(l.costRupees) || 0);
      const disc = toPaisa(Number(l.discountRupees) || 0);
      subtotal += qty * cost;
      discount += disc;
    }
    const net = subtotal - discount;
    const vat = applyVat ? vatOf(net) : 0;
    return { subtotal, discount, vat, total: net + vat };
  }, [lines, applyVat]);

  async function submit() {
    if (!supplierId) {
      toast.error("Choose a supplier.");
      return;
    }
    // Batch number, manufacture date and expiry date are required on every line
    // — they drive sell-oldest-first and the expiry warnings.
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.itemId) {
        toast.error(`Line ${i + 1}: choose an item.`);
        return;
      }
      if (!l.batchNo.trim()) {
        toast.error(`Line ${i + 1}: enter the batch number.`);
        return;
      }
      if (!l.mfgDateBs) {
        toast.error(`Line ${i + 1}: enter the manufacture date.`);
        return;
      }
      if (!l.expiryDateBs) {
        toast.error(`Line ${i + 1}: enter the expiry date.`);
        return;
      }
    }
    setBusy(true);
    const res = await createPurchaseAction({
      supplierId,
      supplierInvoiceNo: invoiceNo,
      dateBs,
      applyVat,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        batchNo: l.batchNo.trim(),
        mfgDateBs: l.mfgDateBs || "",
        expiryDateBs: l.expiryDateBs,
        unitLevel: Number(l.unitLevel),
        qty: Number(l.qty) || 0,
        freeQty: Number(l.freeQty) || 0,
        unitCostPaisa: toPaisa(Number(l.costRupees) || 0),
        discountPaisa: toPaisa(Number(l.discountRupees) || 0),
      })),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Purchase saved (${res.purchaseNo})`);
      router.push("/purchases");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[10px] border border-line bg-cream-50 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choose —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier invoice no.">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
          <Field label="Date">
            <DatePickerBS value={dateBs} onChange={setDateBs} />
          </Field>
        </div>
      </section>

      <section className="rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-sage-900">Items</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-[13px] text-sage-600">
              <input
                type="checkbox"
                checked={showBonus}
                onChange={(e) => setShowBonus(e.target.checked)}
              />
              Bonus (free) qty
            </label>
            <Button variant="secondary" onClick={() => setLines((l) => [...l, blankLine()])}>
              <Plus className="h-4 w-4" />
              Add line
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const item = itemsById.get(l.itemId);
            return (
              <div
                key={i}
                className="rounded-[8px] border border-line bg-cream-100 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                  <Field label="Item">
                    <Select
                      value={l.itemId}
                      onChange={(e) => onItemChange(i, e.target.value)}
                    >
                      <option value="">— Choose —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.brandName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Unit">
                    <Select
                      value={String(l.unitLevel)}
                      onChange={(e) =>
                        setLine(i, { unitLevel: Number(e.target.value) })
                      }
                    >
                      {(item?.units ?? [])
                        .sort((a, b) => b.level - a.level)
                        .map((u) => (
                          <option key={u.level} value={u.level}>
                            {u.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Batch no. *">
                    <Input
                      value={l.batchNo}
                      onChange={(e) => setLine(i, { batchNo: e.target.value })}
                    />
                  </Field>
                </div>
                <div
                  className={
                    "mt-3 grid gap-3 sm:items-end " +
                    (showBonus
                      ? "sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                      : "sm:grid-cols-[1fr_1fr_1fr_1fr_auto]")
                  }
                >
                  <Field label="Mfg date *">
                    <DatePickerBS
                      value={l.mfgDateBs}
                      onChange={(v) => setLine(i, { mfgDateBs: v })}
                    />
                  </Field>
                  <Field label="Expiry date *">
                    <DatePickerBS
                      value={l.expiryDateBs}
                      onChange={(v) => setLine(i, { expiryDateBs: v })}
                    />
                  </Field>
                  <Field label="Qty">
                    <Input
                      numeric
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) =>
                        setLine(i, { qty: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                  {showBonus && (
                    <Field label="Free">
                      <Input
                        numeric
                        inputMode="numeric"
                        value={l.freeQty}
                        onChange={(e) =>
                          setLine(i, { freeQty: e.target.value.replace(/\D/g, "") })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Cost/unit (रू)">
                    <Input
                      numeric
                      inputMode="decimal"
                      value={l.costRupees}
                      onChange={(e) => setLine(i, { costRupees: e.target.value })}
                    />
                  </Field>
                  <div className="flex h-10 items-center">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines((ls) => ls.filter((_, idx) => idx !== i))
                        }
                        aria-label="Remove line"
                        className="rounded-[8px] p-2 text-danger-600 hover:bg-danger-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col items-end gap-2 rounded-[10px] border border-line bg-cream-50 p-6">
        <label className="mb-1 flex items-center gap-2 self-start text-[14px] text-sage-900">
          <input
            type="checkbox"
            checked={applyVat}
            onChange={(e) => setApplyVat(e.target.checked)}
          />
          This purchase includes 13% VAT
        </label>
        <Row label="Subtotal" value={formatPaisa(totals.subtotal)} />
        <Row label="Discount" value={`- ${formatPaisa(totals.discount, false)}`} />
        {applyVat && <Row label="VAT (13%)" value={formatPaisa(totals.vat)} />}
        <div className="flex w-56 justify-between border-t border-line pt-2 text-[16px] font-semibold">
          <span>Total</span>
          <span className="tnum">{formatPaisa(totals.total)}</span>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/purchases")}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "…" : "Save purchase"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-56 justify-between text-[14px] text-sage-700">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
