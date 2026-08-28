/**
 * pos-types.ts — shared client/server shapes for the POS. No server-only imports,
 * so both the browser (cache, store) and the server (catalog repo) can use them.
 */

export interface PosUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface PosBatch {
  id: string;
  batchNo: string;
  expiryDateAd: string;
  remainingBaseQty: number;
  costPaisaPerBase: number;
}

export interface PosItem {
  id: string;
  brandName: string;
  genericName: string;
  category: string;
  controlledFlag: boolean;
  /** visual form (capsule/tablet/bottle/…) for the pictorial unit picker */
  shape: string;
  units: PosUnit[];
  batches: PosBatch[];
}

export interface PosCatalog {
  version: string;
  items: PosItem[];
}

/** A bill queued in the outbox, ready to POST to /api/bills. */
export interface OutboxBill {
  id: string; // ULID
  dateBs: string;
  dateAd: string;
  patientName: string;
  paymentMethod: "cash" | "qr" | "credit";
  tenderedPaisa: number;
  billDiscountPaisa: number;
  lines: {
    id: string;
    itemId: string;
    unitLevel: number;
    qty: number;
    ratePaisa: number;
    rateOverridden: boolean;
    discountPaisa: number;
    overrideBatchId?: string;
  }[];
  clientCreatedAt: string;
  attempts: number;
  lastError?: string;
  /** assigned after a successful sync */
  invoiceNo?: number;
  fiscalLabel?: string;
}

/** A parked (held) bill — a snapshot of the active bill's editable state. */
export interface HeldBill {
  id: string;
  heldAt: string;
  patientName: string;
  lines: HeldLine[];
}

export interface HeldLine {
  itemId: string;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}
