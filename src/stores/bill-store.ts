"use client";

/**
 * bill-store.ts — Zustand store for the ONE active bill. Synchronous, keyboard-
 * driven local state (Architecture §1). Money in paisa; qty in the selling unit.
 */
import { create } from "zustand";
import { ulid } from "ulid";
import type { PosItem } from "@/lib/pos-types";
import type { HeldLine } from "@/lib/pos-types";
import { defaultUnit, unitByLevel, type BillLine } from "@/lib/bill-calc";

export type PaymentMethod = "cash" | "qr" | "credit";

interface BillState {
  lines: BillLine[];
  patientName: string;
  paymentMethod: PaymentMethod;
  tenderedPaisa: number;
  billDiscountPaisa: number;
  activeLineId: string | null;

  addItem: (item: PosItem) => void;
  removeLine: (lineId: string) => void;
  setQty: (lineId: string, qty: number) => void;
  cycleUnit: (lineId: string) => void;
  setUnit: (lineId: string, level: number) => void;
  setRate: (lineId: string, ratePaisa: number) => void;
  setLineDiscount: (lineId: string, discountPaisa: number) => void;
  setOverrideBatch: (lineId: string, batchId: string | undefined) => void;
  setActiveLine: (lineId: string | null) => void;
  setPatientName: (name: string) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setTendered: (paisa: number) => void;
  setBillDiscount: (paisa: number) => void;
  reset: () => void;
  loadLines: (lines: BillLine[], patientName: string) => void;
}

function makeLine(item: PosItem): BillLine {
  const u = defaultUnit(item);
  return {
    lineId: ulid(),
    item,
    unitLevel: u.level,
    qty: 1,
    ratePaisa: u.sellingRatePaisa,
    rateOverridden: false,
    discountPaisa: 0,
  };
}

export const useBillStore = create<BillState>((set) => ({
  lines: [],
  patientName: "",
  paymentMethod: "cash",
  tenderedPaisa: 0,
  billDiscountPaisa: 0,
  activeLineId: null,

  addItem: (item) =>
    set((s) => {
      const line = makeLine(item);
      return { lines: [...s.lines, line], activeLineId: line.lineId };
    }),

  removeLine: (lineId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),

  setQty: (lineId, qty) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineId === lineId ? { ...l, qty: Math.max(1, qty) } : l,
      ),
    })),

  cycleUnit: (lineId) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.lineId !== lineId) return l;
        const levels = [...l.item.units].map((u) => u.level).sort((a, b) => a - b);
        const idx = levels.indexOf(l.unitLevel);
        const nextLevel = levels[(idx + 1) % levels.length]!;
        const u = unitByLevel(l.item, nextLevel)!;
        return {
          ...l,
          unitLevel: nextLevel,
          qty: 1,
          ratePaisa: u.sellingRatePaisa,
          rateOverridden: false,
        };
      }),
    })),

  setUnit: (lineId, level) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.lineId !== lineId) return l;
        const u = unitByLevel(l.item, level);
        if (!u) return l;
        return {
          ...l,
          unitLevel: level,
          qty: 1,
          ratePaisa: u.sellingRatePaisa,
          rateOverridden: false,
        };
      }),
    })),

  setRate: (lineId, ratePaisa) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.lineId !== lineId) return l;
        const u = unitByLevel(l.item, l.unitLevel);
        return {
          ...l,
          ratePaisa,
          rateOverridden: ratePaisa !== (u?.sellingRatePaisa ?? ratePaisa),
        };
      }),
    })),

  setLineDiscount: (lineId, discountPaisa) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineId === lineId ? { ...l, discountPaisa: Math.max(0, discountPaisa) } : l,
      ),
    })),

  setOverrideBatch: (lineId, batchId) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineId === lineId ? { ...l, overrideBatchId: batchId } : l,
      ),
    })),

  setActiveLine: (lineId) => set({ activeLineId: lineId }),
  setPatientName: (name) => set({ patientName: name }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  setTendered: (paisa) => set({ tenderedPaisa: Math.max(0, paisa) }),
  setBillDiscount: (paisa) => set({ billDiscountPaisa: Math.max(0, paisa) }),

  reset: () =>
    set({
      lines: [],
      patientName: "",
      paymentMethod: "cash",
      tenderedPaisa: 0,
      billDiscountPaisa: 0,
      activeLineId: null,
    }),

  loadLines: (lines, patientName) =>
    set({
      lines,
      patientName,
      paymentMethod: "cash",
      tenderedPaisa: 0,
      billDiscountPaisa: 0,
      activeLineId: lines[lines.length - 1]?.lineId ?? null,
    }),
}));

/** Rebuild BillLines from held-bill snapshot lines using the current catalog. */
export function linesFromHeld(held: HeldLine[], items: PosItem[]): BillLine[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: BillLine[] = [];
  for (const h of held) {
    const item = byId.get(h.itemId);
    if (!item) continue;
    out.push({
      lineId: ulid(),
      item,
      unitLevel: h.unitLevel,
      qty: h.qty,
      ratePaisa: h.ratePaisa,
      rateOverridden: h.rateOverridden,
      discountPaisa: h.discountPaisa,
      overrideBatchId: h.overrideBatchId,
    });
  }
  return out;
}
