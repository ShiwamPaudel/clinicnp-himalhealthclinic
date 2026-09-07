/**
 * validators — zod schemas shared by client forms and server actions (one source of truth).
 */
import { z } from "zod";
import { ITEM_SHAPE_KEYS, type ItemShape } from "@/lib/item-shape";
import { FURNITURE_KINDS, type FurnitureKind } from "@/lib/furniture";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const pinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export const roleSchema = z.enum(["admin", "staff", "accountant"]);

export const newUserSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, . _ - only"),
  password: z.string().min(6, "At least 6 characters"),
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be 4 digits")
    .optional()
    .or(z.literal("")),
  role: roleSchema,
  canEditRate: z.boolean(),
});
export type NewUserInput = z.infer<typeof newUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
  canEditRate: z.boolean().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .or(z.literal("")),
});

// ---- Phase 2: items, suppliers, purchases ----

export const categorySchema = z.enum(["Medicine", "Consumable", "Other"]);

export const itemUnitSchema = z.object({
  level: z.number().int().min(0).max(2),
  name: z.string().min(1, "Unit needs a name"),
  factorToBase: z.number().int().min(1),
  sellingRatePaisa: z.number().int().min(0),
  isDefaultSelling: z.boolean(),
});

export const itemSchema = z.object({
  id: z.string().optional(),
  brandName: z.string().min(1, "Enter a brand name"),
  genericName: z.string(),
  category: categorySchema,
  manufacturer: z.string(),
  minStockBaseQty: z.number().int().min(0),
  controlledFlag: z.boolean(),
  preferredSupplierId: z.string().nullable(),
  active: z.boolean(),
  shape: z.enum(ITEM_SHAPE_KEYS as [ItemShape, ...ItemShape[]]),
  units: z.array(itemUnitSchema).min(1, "Add at least the base unit"),
});
export type ItemFormInput = z.infer<typeof itemSchema>;

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Enter a supplier name"),
  panNo: z.string(),
  phone: z.string(),
  address: z.string(),
  contactPerson: z.string(),
  terms: z.string(),
  active: z.boolean(),
});
export type SupplierFormInput = z.infer<typeof supplierSchema>;

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amountPaisa: z.number().int().min(1, "Enter an amount"),
  method: z.string().min(1),
  note: z.string(),
});

export const purchaseLineSchema = z.object({
  itemId: z.string().min(1),
  batchNo: z.string().min(1, "Batch number required"),
  mfgDateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a manufacture date"),
  expiryDateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an expiry date"),
  unitLevel: z.number().int().min(0).max(2),
  qty: z.number().int().min(1, "Quantity required"),
  freeQty: z.number().int().min(0),
  unitCostPaisa: z.number().int().min(0),
  discountPaisa: z.number().int().min(0),
});

export const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  supplierInvoiceNo: z.string(),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  applyVat: z.boolean(),
  lines: z.array(purchaseLineSchema).min(1, "Add at least one item"),
});
export type PurchaseFormInput = z.infer<typeof purchaseSchema>;

export const purchaseReturnSchema = z.object({
  supplierId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  reason: z.string(),
  lines: z
    .array(
      z.object({
        batchId: z.string().min(1),
        itemId: z.string().min(1),
        baseQty: z.number().int().min(1),
        costPaisa: z.number().int().min(0),
      }),
    )
    .min(1, "Choose at least one batch"),
});

// ---- Phase 3: bill ingest (outbox -> /api/bills) ----

export const ingestLineSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  unitLevel: z.number().int().min(0).max(2),
  qty: z.number().int().min(1),
  ratePaisa: z.number().int().min(0),
  rateOverridden: z.boolean(),
  discountPaisa: z.number().int().min(0),
  overrideBatchId: z.string().optional(),
});

export const ingestServiceLineSchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  qty: z.number().int().min(1),
  ratePaisa: z.number().int().min(0),
  rateOverridden: z.boolean(),
  discountPaisa: z.number().int().min(0),
  doctorId: z.string().nullable(),
  labPartnerId: z.string().nullable(),
  followupApplied: z.boolean(),
});

/**
 * A patient carried inline with a bill, for when the bill reaches the server
 * before the registration does (Architecture §2.1 Path B).
 */
export const inlinePatientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sex: z.enum(["f", "m", "o"]),
  ageValue: z.number().int().nullable(),
  ageUnit: z.enum(["y", "m", "d"]).nullable(),
  ageAsOfAd: z.string().nullable(),
  phone: z.string().default(""),
  address: z.string().default(""),
});

export const ingestBillSchema = z.object({
  id: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateAd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patientName: z.string(),
  paymentMethod: z.enum(["cash", "qr", "credit"]),
  tenderedPaisa: z.number().int().min(0),
  billDiscountPaisa: z.number().int().min(0),
  lines: z.array(ingestLineSchema),
  serviceLines: z.array(ingestServiceLineSchema).optional(),
  patientId: z.string().optional(),
  patient: inlinePatientSchema.optional(),
  visitId: z.string().optional(),
  clientCreatedAt: z.string(),
})
  // A bill has to be for something. Either block alone is a real bill: a
  // medicine-only sale, or a consultation with nothing dispensed.
  .refine((b) => b.lines.length > 0 || (b.serviceLines?.length ?? 0) > 0, {
    message: "Add at least one item or service",
    path: ["lines"],
  })
  // A service belongs to somebody (PRD §4B.4). The patient may be named by id
  // or carried inline; either way the bill knows who it is for.
  .refine(
    (b) =>
      (b.serviceLines?.length ?? 0) === 0 ||
      Boolean(b.patientId) ||
      Boolean(b.patient),
    {
      message: "A bill with a service on it needs a patient",
      path: ["patientId"],
    },
  )
  // If both are given they must agree, or the bill is describing two people.
  .refine((b) => !b.patient || !b.patientId || b.patient.id === b.patientId, {
    message: "That bill names two different patients",
    path: ["patient"],
  });
export type IngestBillPayload = z.infer<typeof ingestBillSchema>;

export const companySchema = z.object({
  name: z.string().min(1, "Enter the pharmacy name"),
  address: z.string(),
  phone: z.string(),
  panNo: z.string(),
  ddaNo: z.string(),
  vatRegistered: z.boolean(),
  invoiceFooter: z.string(),
  logoUrl: z.string().nullable(),
  printFormat: z.enum(["thermal", "a5", "a4_half"]),
  roundingOn: z.boolean(),
  expiryAlertDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  minRateIsCost: z.boolean(),
  rackDisplay: z.enum(["off", "text", "visual"]),
});
export type CompanyInput = z.infer<typeof companySchema>;

// ---------------------------------------------------------------------------
// Clinic catalog (Phase 3)
// ---------------------------------------------------------------------------

export const rackSchema = z.object({
  name: z.string().min(1, "Give it a name"),
  kind: z.enum(FURNITURE_KINDS as unknown as [FurnitureKind, ...FurnitureKind[]]),
  rows: z.number().int().min(1, "At least one row").max(26, "That is too many rows for one rack"),
  cols: z.number().int().min(1, "At least one column").max(26, "That is too many columns for one rack"),
  posX: z.number().int().min(-99).max(99),
  posY: z.number().int().min(-99).max(99),
  note: z.string().max(120, "Keep the note short").optional(),
  active: z.boolean(),
});
export type RackFormInput = z.infer<typeof rackSchema>;

export const itemLocationSchema = z.object({
  itemId: z.string().min(1),
  rackId: z.string().min(1).nullable(),
  row: z.number().int().min(1).max(26).nullable(),
  col: z.number().int().min(1).max(26).nullable(),
  note: z.string().max(120, "Keep the note short"),
});

export const serviceGroupSchema = z.object({
  name: z.string().min(1, "Enter a group name"),
  sortOrder: z.number().int().min(0).max(9999),
  isConsultation: z.boolean(),
  active: z.boolean(),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Enter a service name"),
  code: z.string().max(24, "Keep the short code brief"),
  groupId: z.string().min(1, "Choose a group"),
  ratePaisa: z.number().int().min(0, "A rate cannot be negative"),
  doctorRequired: z.boolean(),
  defaultDoctorId: z.string().nullable(),
  outsourced: z.boolean(),
  defaultLabPartnerId: z.string().nullable(),
  partnerCostPaisa: z.number().int().min(0, "A cost cannot be negative"),
  keepsFile: z.boolean(),
  followupDays: z.number().int().min(0).max(365, "A follow-up window is at most a year"),
  followupRatePaisa: z.number().int().min(0),
  vatApplicable: z.boolean(),
  active: z.boolean(),
});
export type ServiceFormInput = z.infer<typeof serviceSchema>;

export const shareBasisSchema = z.enum([
  "none",
  "pct_consult",
  "fixed_consult",
  "pct_services",
]);

export const doctorSchema = z.object({
  name: z.string().min(1, "Enter the doctor's name"),
  qualification: z.string(),
  specialty: z.string(),
  nmcNo: z.string(),
  phone: z.string(),
  shareBasis: shareBasisSchema,
  /** basis points for the percentage bases, paisa for a fixed amount */
  shareValue: z.number().int().min(0),
  active: z.boolean(),
});
export type DoctorFormInput = z.infer<typeof doctorSchema>;

export const labPartnerSchema = z.object({
  name: z.string().min(1, "Enter the laboratory's name"),
  panNo: z.string(),
  phone: z.string(),
  address: z.string(),
  contactPerson: z.string(),
  terms: z.string(),
  active: z.boolean(),
});
export type LabPartnerFormInput = z.infer<typeof labPartnerSchema>;

export const labPartnerPaymentSchema = z.object({
  partnerId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amountPaisa: z.number().int().min(1, "Enter an amount"),
  method: z.enum(["cash", "bank", "cheque", "qr", "adjustment"]),
  note: z.string(),
});
