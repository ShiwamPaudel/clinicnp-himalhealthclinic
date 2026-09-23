"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { InvoicePhotoButton } from "@/components/app/invoice-photo";
import { createPurchaseAction } from "@/app/(app)/purchases/actions";
import { toPaisa, formatPaisa, vatOf } from "@/lib/money";
import { clampPercent, resolveBillDiscount, type DiscountMode } from "@/lib/discount";
import { bsToDbText, today } from "@/lib/bs";
import type { Draft } from "@/lib/invoice-read/draft";
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
  /**
   * Only set on lines that came off a photo: the medicine's name as the
   * supplier printed it, and whether the row's own arithmetic disagreed with
   * the printed amount. Both are shown beside the boxes and neither is saved.
   */
  printedName?: string;
  amountDisagrees?: boolean;
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
  // Suppliers take their discount off the whole bill, after the lines: some
  // print a percentage ("10% Discount"), some an amount ("LESS DISCOUNT
  // 480.61"), and most then round the net total to whole rupees (D-143).
  const [billDiscountMode, setBillDiscountMode] = useState<DiscountMode>("amount");
  const [billDiscountRupees, setBillDiscountRupees] = useState("");
  const [billDiscountPercent, setBillDiscountPercent] = useState("");
  const [roundingRupees, setRoundingRupees] = useState("");
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  // What a photo said the bill came to, kept only so the form can say whether
  // the two agree. It is never what gets saved — the lines are.
  const [billNetTotalPaisa, setBillNetTotalPaisa] = useState<number | null>(null);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /**
   * Put what was read off a photo into the boxes. Everything is replaced, not
   * merged: a half-typed purchase and a photo of a different bill have nothing
   * to do with each other, and quietly mixing the two would be the worst of
   * both. The supplier is left alone — a name on a bill is not a supplier
   * record, and picking the wrong one puts money on the wrong ledger.
   */
  function applyDraft(draft: Draft) {
    if (draft.invoiceNo) setInvoiceNo(draft.invoiceNo);
    if (draft.dateBs) setDateBs(draft.dateBs);
    setApplyVat(draft.applyVat);
    setBillDiscountMode("amount");
    setBillDiscountRupees(draft.billDiscountRupees);
    setBillDiscountPercent("");
    setRoundingRupees(draft.roundingRupees);
    setBillNetTotalPaisa(draft.netTotalPaisa);
    if (draft.lines.some((l) => Number(l.freeQty) > 0)) setShowBonus(true);
    setLines(
      draft.lines.map((l) => ({
        ...blankLine(),
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        batchNo: l.batchNo,
        expiryDateBs: l.expiryDateBs,
        qty: l.qty,
        freeQty: l.freeQty,
        costRupees: l.costRupees,
        printedName: l.printedName,
        amountDisagrees: l.amountDisagrees,
      })),
    );
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
    const afterLines = Math.max(0, subtotal - discount);
    // The paper's order: lines, the discount on the whole bill, VAT on what is
    // left, then the rounding line.
    const billDiscount = Math.min(
      resolveBillDiscount(
        afterLines,
        billDiscountMode,
        toPaisa(Number(billDiscountRupees) || 0),
        Number(billDiscountPercent) || 0,
      ),
      afterLines,
    );
    const taxable = afterLines - billDiscount;
    const vat = applyVat ? vatOf(taxable) : 0;
    const rounding = toPaisa(Number(roundingRupees) || 0);
    return {
      subtotal,
      discount,
      billDiscount,
      taxable,
      vat,
      rounding,
      total: taxable + vat + rounding,
    };
  }, [
    lines,
    applyVat,
    billDiscountMode,
    billDiscountRupees,
    billDiscountPercent,
    roundingRupees,
  ]);

  /** Lines a photo filled in but could not find a medicine for. */
  const unmatched = lines.filter((l) => l.printedName && !l.itemId).length;

  async function submit() {
    if (!supplierId) {
      toast.error("Choose a supplier.");
      return;
    }
    // Batch number and expiry date are required on every line — they drive
    // sell-oldest-first and the expiry warnings. The manufacture date is
    // optional: many packs and supplier bills do not print one.
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
      if (!l.expiryDateBs) {
        toast.error(`Line ${i + 1}: enter the expiry date.`);
        return;
      }
      if (l.mfgDateBs && l.mfgDateBs > l.expiryDateBs) {
        toast.error(
          `Line ${i + 1}: it cannot expire before it was manufactured. Check the dates.`,
        );
        return;
      }
    }
    if (billDiscountMode === "percent" && Number(billDiscountPercent) > 100) {
      toast.error("A discount cannot be more than 100%.");
      return;
    }
    setBusy(true);
    const res = await createPurchaseAction({
      supplierId,
      supplierInvoiceNo: invoiceNo,
      dateBs,
      applyVat,
      billDiscountPaisa: totals.billDiscount,
      roundingPaisa: totals.rounding,
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
      <section className="rounded-[10px] border border-line bg-cream-50 p-4">
        <InvoicePhotoButton items={items} onDraft={applyDraft} />
      </section>

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
            {unmatched > 0 && (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="flex items-center gap-1.5 text-[13px] text-sage-600 underline-offset-2 hover:text-sage-900 hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload the item list
              </button>
            )}
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
                {l.amountDisagrees && (
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] text-danger-600">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    Quantity times rate did not come to the amount printed on
                    this row. Check all three against the paper.
                  </p>
                )}
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
                    {/* What the paper actually said, so the person can check
                        the guess — or find the medicine themselves when there
                        was no guess to make. */}
                    {l.printedName && (
                      <p
                        className={
                          "mt-1 text-[12px] " +
                          (l.itemId ? "text-sage-500" : "font-medium text-danger-600")
                        }
                      >
                        {l.itemId ? (
                          <>On the bill: {l.printedName}</>
                        ) : (
                          <>
                            &ldquo;{l.printedName}&rdquo; is not in the list — choose it, or{" "}
                            <Link
                              href="/items/new"
                              target="_blank"
                              className="underline underline-offset-2"
                            >
                              add it
                            </Link>{" "}
                            and reload the list.
                          </>
                        )}
                      </p>
                    )}
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
                  <Field label="Mfg date (optional)">
                    <DatePickerBS
                      value={l.mfgDateBs}
                      onChange={(v) => setLine(i, { mfgDateBs: v })}
                      clearable
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
        {/* The supplier's own totals block, in their order, so the two can be
            read against each other line by line (D-143). */}
        <Row label="Subtotal" value={formatPaisa(totals.subtotal)} />
        {totals.discount > 0 && (
          <Row label="Line discounts" value={`- ${formatPaisa(totals.discount, false)}`} />
        )}

        <div className="flex w-full flex-col items-end gap-1.5 border-t border-line pt-3">
          <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
            From the supplier&apos;s bill
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-sage-700">Discount on the bill</span>
            <div
              role="group"
              aria-label="Discount on the bill"
              className="inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5"
            >
              <ModeChip
                active={billDiscountMode === "amount"}
                onClick={() => setBillDiscountMode("amount")}
                label="Discount in rupees"
              >
                रू
              </ModeChip>
              <ModeChip
                active={billDiscountMode === "percent"}
                onClick={() => setBillDiscountMode("percent")}
                label="Discount in percent"
              >
                %
              </ModeChip>
            </div>
            {billDiscountMode === "amount" ? (
              <Input
                numeric
                inputMode="decimal"
                className="w-28 text-right"
                aria-label="Discount on the bill, rupees"
                value={billDiscountRupees}
                onChange={(e) => setBillDiscountRupees(e.target.value)}
              />
            ) : (
              <Input
                numeric
                inputMode="decimal"
                className="w-28 text-right"
                aria-label="Discount on the bill, percent"
                value={billDiscountPercent}
                onChange={(e) => setBillDiscountPercent(e.target.value)}
              />
            )}
          </div>
          {billDiscountMode === "percent" && Number(billDiscountPercent) > 0 && (
            <p className="text-[12px] text-sage-500">
              {Number(billDiscountPercent) > 100
                ? "At most 100%."
                : `${clampPercent(Number(billDiscountPercent))}% of ${formatPaisa(
                    Math.max(0, totals.subtotal - totals.discount),
                  )} — ${formatPaisa(totals.billDiscount)}`}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-sage-700">Rounding</span>
            <Input
              numeric
              inputMode="decimal"
              className="w-28 text-right"
              aria-label="Rounding, rupees"
              placeholder="0.00"
              value={roundingRupees}
              onChange={(e) => setRoundingRupees(e.target.value)}
            />
          </div>
          <p className="max-w-[320px] text-right text-[12px] text-sage-500">
            Copy these from the paper. Rounding may be a minus figure.
          </p>
        </div>

        {totals.billDiscount > 0 && (
          <Row label="Taxable amount" value={formatPaisa(totals.taxable)} />
        )}
        {applyVat && <Row label="VAT (13%)" value={formatPaisa(totals.vat)} />}
        {totals.rounding !== 0 && (
          <Row label="Rounding" value={formatPaisa(totals.rounding)} />
        )}
        <div className="flex w-56 justify-between border-t border-line pt-2 text-[16px] font-semibold">
          <span>Net total</span>
          <span className="tnum">{formatPaisa(totals.total)}</span>
        </div>
        {/* The one check that catches a line the photo missed altogether: the
            bill's own net total against what the lines here come to. */}
        {billNetTotalPaisa !== null && (
          <p
            className={
              "max-w-[320px] text-right text-[12px] " +
              (billNetTotalPaisa === totals.total ? "text-sage-500" : "font-medium text-danger-600")
            }
          >
            {billNetTotalPaisa === totals.total ? (
              <>This matches the net total on the bill.</>
            ) : (
              <>
                The bill says {formatPaisa(billNetTotalPaisa)}. A line is
                missing or wrong — check it against the paper before saving.
              </>
            )}
          </p>
        )}
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

function ModeChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={
        "rounded-[6px] px-2 py-0.5 text-[13px] transition-colors " +
        (active ? "bg-sage-700 text-cream-50" : "text-sage-600 hover:text-sage-900")
      }
    >
      {children}
    </button>
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
