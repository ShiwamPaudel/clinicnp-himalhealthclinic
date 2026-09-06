/**
 * validators — zod schemas shared by client forms and server actions (one source of truth).
 */
import { z } from "zod";
import { ITEM_SHAPE_KEYS, type ItemShape } from "@/lib/item-shape";

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
  rack: z.string(),
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
  visitId: z.string().optional(),
  clientCreatedAt: z.string(),
})
  // A bill has to be for something. Either block alone is a real bill: a
  // medicine-only sale, or a consultation with nothing dispensed.
  .refine((b) => b.lines.length > 0 || (b.serviceLines?.length ?? 0) > 0, {
    message: "Add at least one item or service",
    path: ["lines"],
  })
  // A service belongs to somebody (PRD §4B.4).
  .refine((b) => (b.serviceLines?.length ?? 0) === 0 || Boolean(b.patientId), {
    message: "A bill with a service on it needs a patient",
    path: ["patientId"],
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
  printFormat: z.enum(["thermal", "a5"]),
  roundingOn: z.boolean(),
  expiryAlertDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  minRateIsCost: z.boolean(),
});
export type CompanyInput = z.infer<typeof companySchema>;

// ---------------------------------------------------------------------------
// Clinic catalog (Phase 3)
// ---------------------------------------------------------------------------

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
