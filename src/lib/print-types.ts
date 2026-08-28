/** print-types.ts — the fully-resolved bill shape handed to print components. */

export interface PrintBatchLine {
  batchNo: string;
  expiryBs: string;
}

export interface PrintLine {
  name: string;
  genericName: string;
  batches: PrintBatchLine[];
  qty: number;
  unitName: string;
  ratePaisa: number;
  discountPaisa: number;
  amountPaisa: number;
  rateOverridden: boolean;
  controlled: boolean;
}

export interface PrintCompany {
  name: string;
  address: string;
  phone: string;
  panNo: string;
  ddaNo: string;
  invoiceFooter: string;
  vatRegistered: boolean;
}

export interface PrintBill {
  company: PrintCompany;
  invoiceLabel: string; // "SI-2083/84-000123" or provisional slip
  provisional: boolean;
  dateBsLong: string;
  timeStr: string;
  patientName: string;
  lines: PrintLine[];
  subtotalPaisa: number;
  billDiscountPaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  paymentMethod: "cash" | "qr" | "credit";
  tenderedPaisa: number;
  changePaisa: number;
  userName: string;
}
