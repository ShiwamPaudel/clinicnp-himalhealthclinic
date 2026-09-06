/**
 * The outbox posts a bill field by field, so the queue's own bookkeeping never
 * reaches the server. The cost of that is that a field added to a bill and
 * forgotten in the payload builder is silently dropped in transit — the bill
 * saves, minus the part nobody noticed.
 *
 * That happened once: service lines and the patient were dropped, and a mixed
 * bill arrived as a medicine-only one. These tests make the next occurrence a
 * failure instead of a surprise.
 */
import { describe, it, expect } from "vitest";
import { billRequestBody, OUTBOX_ONLY_FIELDS } from "@/offline/outbox";
import type { OutboxBill } from "@/lib/pos-types";

/** A bill with every field a bill can carry populated. */
const fullBill: Required<
  Omit<OutboxBill, "lastError" | "invoiceNo" | "fiscalLabel" | "patient">
> &
  OutboxBill = {
  id: "01HZZZ",
  dateBs: "2083-05-13",
  dateAd: "2026-08-29",
  patientName: "Anita Shrestha",
  patientId: "01PATIENT",
  visitId: "01VISIT",
  paymentMethod: "cash",
  tenderedPaisa: 20_000,
  billDiscountPaisa: 500,
  lines: [
    {
      id: "l1",
      itemId: "i1",
      unitLevel: 1,
      qty: 2,
      ratePaisa: 1_800,
      rateOverridden: false,
      discountPaisa: 0,
      overrideBatchId: "b1",
    },
  ],
  serviceLines: [
    {
      id: "s1",
      serviceId: "svc1",
      qty: 1,
      ratePaisa: 50_000,
      rateOverridden: false,
      discountPaisa: 0,
      doctorId: "doc1",
      labPartnerId: null,
      followupApplied: false,
    },
  ],
  clientCreatedAt: "2026-08-29T10:00:00.000Z",
  attempts: 3,
};

describe("the outbox payload", () => {
  it("carries every field of a bill that the server needs", () => {
    const body = billRequestBody(fullBill);
    const skipped = new Set<string>(OUTBOX_ONLY_FIELDS);

    const missing = Object.keys(fullBill).filter(
      (k) => !skipped.has(k) && !(k in body),
    );
    expect(missing).toEqual([]);
  });

  it("carries the service lines and the patient", () => {
    const body = billRequestBody(fullBill);
    expect(body.serviceLines).toHaveLength(1);
    expect(body.patientId).toBe("01PATIENT");
    expect(body.visitId).toBe("01VISIT");
  });

  it("never posts the queue's own bookkeeping", () => {
    const body = billRequestBody({ ...fullBill, lastError: "boom", invoiceNo: 7 });
    for (const field of OUTBOX_ONLY_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("sends an empty list rather than nothing for a medicine-only bill", () => {
    const { serviceLines: _drop, ...medicineOnly } = fullBill;
    const body = billRequestBody(medicineOnly as OutboxBill);
    expect(body.serviceLines).toEqual([]);
  });
});
