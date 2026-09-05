"use client";

/**
 * bill-store.ts — Zustand store for the ONE active bill. Synchronous, keyboard-
 * driven local state (Architecture §1). Money in paisa; qty in the selling unit.
 */
import { create } from "zustand";
import { ulid } from "ulid";
import type { PosItem, PosService } from "@/lib/pos-types";
import type { HeldLine } from "@/lib/pos-types";
import {
  defaultUnit,
  unitByLevel,
  type BillLine,
  type ServiceLine,
} from "@/lib/bill-calc";

export type PaymentMethod = "cash" | "qr" | "credit";

/**
 * The patient attached to this bill. A medicine-only bill may leave it empty;
 * a bill with any service line may not (PRD §4B.4).
 */
export interface AttachedPatient {
  id: string;
  patientNo: number | null;
  name: string;
  sex: string;
  ageShort: string;
}

interface BillState {
  lines: BillLine[];
  serviceLines: ServiceLine[];
  /** the patient this bill is for, once one is attached */
  patient: AttachedPatient | null;
  /** an open visit today, if the counter attached the bill to one */
  visitId: string | null;
  patientName: string;
  paymentMethod: PaymentMethod;
  tenderedPaisa: number;
  billDiscountPaisa: number;
  activeLineId: string | null;

  addItem: (item: PosItem) => void;
  addService: (service: PosService) => void;
  removeLine: (lineId: string) => void;
  removeServiceLine: (lineId: string) => void;
  setServiceQty: (lineId: string, qty: number) => void;
  setServiceRate: (lineId: string, ratePaisa: number) => void;
  setServiceDiscount: (lineId: string, discountPaisa: number) => void;
  setServiceDoctor: (lineId: string, doctorId: string | null) => void;
  setServicePartner: (lineId: string, partnerId: string | null) => void;
  /** the server-resolved follow-up outcome for a line, or an override back to full rate */
  applyFollowup: (
    lineId: string,
    outcome: { ratePaisa: number; applied: boolean; note: string },
  ) => void;
  setPatient: (patient: AttachedPatient | null) => void;
  setVisitId: (visitId: string | null) => void;
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

function makeServiceLine(service: PosService): ServiceLine {
  return {
    lineId: ulid(),
    serviceId: service.id,
    name: service.name,
    groupId: service.groupId,
    qty: 1,
    ratePaisa: service.ratePaisa,
    rateOverridden: false,
    discountPaisa: 0,
    vatApplicable: service.vatApplicable,
    doctorId: service.defaultDoctorId,
    labPartnerId: service.outsourced ? service.defaultLabPartnerId : null,
    followupApplied: false,
    followupNote: "",
  };
}

export const useBillStore = create<BillState>((set) => ({
  lines: [],
  serviceLines: [],
  patient: null,
  visitId: null,
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

  addService: (service) =>
    set((s) => {
      const line = makeServiceLine(service);
      return {
        serviceLines: [...s.serviceLines, line],
        activeLineId: line.lineId,
      };
    }),

  removeLine: (lineId) =>
    set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),

  removeServiceLine: (lineId) =>
    set((s) => ({
      serviceLines: s.serviceLines.filter((l) => l.lineId !== lineId),
    })),

  setServiceQty: (lineId, qty) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId ? { ...l, qty: Math.max(1, qty) } : l,
      ),
    })),

  setServiceRate: (lineId, ratePaisa) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId
          ? { ...l, ratePaisa: Math.max(0, ratePaisa), rateOverridden: true }
          : l,
      ),
    })),

  setServiceDiscount: (lineId, discountPaisa) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId
          ? { ...l, discountPaisa: Math.max(0, discountPaisa) }
          : l,
      ),
    })),

  setServiceDoctor: (lineId, doctorId) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId ? { ...l, doctorId } : l,
      ),
    })),

  setServicePartner: (lineId, partnerId) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId ? { ...l, labPartnerId: partnerId } : l,
      ),
    })),

  applyFollowup: (lineId, outcome) =>
    set((s) => ({
      serviceLines: s.serviceLines.map((l) =>
        l.lineId === lineId
          ? {
              ...l,
              ratePaisa: outcome.ratePaisa,
              followupApplied: outcome.applied,
              followupNote: outcome.note,
              // Turning a free follow-up back into a full charge is a person
              // making a call, so it is marked like any other rate override.
              rateOverridden: !outcome.applied && l.followupApplied,
            }
          : l,
      ),
    })),

  setPatient: (patient) =>
    set({ patient, patientName: patient?.name ?? "" }),

  setVisitId: (visitId) => set({ visitId }),

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
      serviceLines: [],
      patient: null,
      visitId: null,
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
