"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { useBillStore } from "@/stores/bill-store";
import { billTotals } from "@/lib/bill-calc";
import { toPaisa, paisaToRupees, formatPaisa, change } from "@/lib/money";
import type { PosConfig } from "@/components/pos/bill-table";
import { npLabels } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface PaymentPaneHandle {
  focusTendered: () => void;
}

const METHODS: { key: "cash" | "qr" | "credit"; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "qr", label: "QR" },
  { key: "credit", label: "Credit" },
];

export const PaymentPane = forwardRef<
  PaymentPaneHandle,
  { config: PosConfig; saving: boolean; lang: "en" | "np"; onSave: () => void }
>(({ config, saving, lang, onSave }, ref) => {
  const {
    lines,
    patientName,
    paymentMethod,
    tenderedPaisa,
    billDiscountPaisa,
    setPatientName,
    setPaymentMethod,
    setTendered,
    setBillDiscount,
  } = useBillStore();

  const tenderRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    focusTendered: () => tenderRef.current?.focus(),
  }));

  const totals = billTotals(lines, billDiscountPaisa, {
    vatRegistered: config.vatRegistered,
    roundingOn: config.roundingOn,
  });
  const changeDue = change(tenderedPaisa, totals.totalPaisa);
  const hasControlled = lines.some((l) => l.item.controlledFlag);
  const needsPatient = hasControlled && patientName.trim() === "";

  return (
    <div className="flex h-full w-full flex-col gap-4 bg-sage-900 p-5 text-cream-50">
      <div>
        <label className="mb-1 block text-[12px] text-cream-50/70">
          Patient name {hasControlled && <span className="text-magenta-100">(required)</span>}
        </label>
        <input
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          placeholder="Optional — printed on the bill"
          className={cn(
            "h-10 w-full rounded-[8px] border bg-sage-950/40 px-3 text-[14px] text-cream-50 placeholder:text-cream-50/40 focus:outline-none",
            needsPatient ? "border-magenta-600" : "border-sage-700",
          )}
        />
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-sage-700/60 pt-3 text-[14px]">
        <Row label="Subtotal" value={formatPaisa(totals.subtotalPaisa)} />
        <div className="flex items-center justify-between">
          <span className="text-cream-50/70">Bill discount</span>
          <input
            inputMode="decimal"
            defaultValue={billDiscountPaisa ? String(paisaToRupees(billDiscountPaisa)) : ""}
            onChange={(e) => setBillDiscount(toPaisa(Number(e.target.value) || 0))}
            placeholder="0"
            className="h-8 w-24 rounded-[8px] border border-sage-700 bg-sage-950/40 px-2 text-right text-[14px] tnum text-cream-50 focus:outline-none"
          />
        </div>
        {config.vatRegistered && (
          <Row label="VAT (13%)" value={formatPaisa(totals.vatPaisa)} />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-sage-700/60 pt-3">
        <span className="text-[16px] font-semibold">Total</span>
        <span className="text-[28px] font-bold tnum">
          {formatPaisa(totals.totalPaisa)}
        </span>
      </div>

      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => setPaymentMethod(m.key)}
            className={cn(
              "flex-1 rounded-[8px] py-2 text-[14px] font-medium transition-colors",
              paymentMethod === m.key
                ? "bg-cream-50 text-sage-900"
                : "bg-sage-700/50 text-cream-50 hover:bg-sage-700",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {paymentMethod === "cash" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-cream-50/70">Tendered</span>
            <input
              ref={tenderRef}
              inputMode="decimal"
              onChange={(e) => setTendered(toPaisa(Number(e.target.value) || 0))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="0"
              className="h-10 w-32 rounded-[8px] border border-sage-700 bg-sage-950/40 px-3 text-right text-[16px] tnum text-cream-50 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-cream-50/70">Change</span>
            <span className="text-[18px] font-semibold tnum">
              {formatPaisa(changeDue)}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={saving || lines.length === 0 || needsPatient}
        className="mt-1 h-12 rounded-[8px] bg-magenta-600 text-[16px] font-semibold text-cream-50 hover:bg-magenta-700 disabled:opacity-50"
      >
        {saving ? (
          "Saving…"
        ) : lang === "np" ? (
          <span>
            <span className="deva">{npLabels.save}</span> &amp; print · F9
          </span>
        ) : (
          "Save & print  ·  F9"
        )}
      </button>
      {needsPatient && (
        <p className="text-[12px] text-magenta-100">
          Enter the patient name for the prescription item before saving.
        </p>
      )}
    </div>
  );
});
PaymentPane.displayName = "PaymentPane";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream-50/70">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
