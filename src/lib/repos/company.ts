/**
 * company.ts — the single-row company profile (id = 1).
 */
import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export type PrintFormat = "thermal" | "a5";
export type ExpiryAlertDays = 30 | 60 | 90;

export interface Company {
  name: string;
  address: string;
  phone: string;
  panNo: string;
  ddaNo: string;
  vatRegistered: boolean;
  invoiceFooter: string;
  logoUrl: string | null;
  printFormat: PrintFormat;
  roundingOn: boolean;
  expiryAlertDays: ExpiryAlertDays;
  minRateIsCost: boolean;
  cbmsEnabled: boolean;
}

const DEFAULTS: Company = {
  name: "",
  address: "",
  phone: "",
  panNo: "",
  ddaNo: "",
  vatRegistered: false,
  invoiceFooter: "Get well soon",
  logoUrl: null,
  printFormat: "thermal",
  roundingOn: false,
  expiryAlertDays: 60,
  minRateIsCost: false,
  cbmsEnabled: false,
};

function mapCompany(r: Row): Company {
  return {
    name: r.name as string,
    address: r.address as string,
    phone: r.phone as string,
    panNo: r.pan_no as string,
    ddaNo: r.dda_no as string,
    vatRegistered: Number(r.vat_registered) === 1,
    invoiceFooter: r.invoice_footer as string,
    logoUrl: (r.logo_url as string | null) ?? null,
    printFormat: r.print_format as PrintFormat,
    roundingOn: Number(r.rounding_on) === 1,
    expiryAlertDays: Number(r.expiry_alert_days) as ExpiryAlertDays,
    minRateIsCost: Number(r.min_rate_is_cost) === 1,
    cbmsEnabled: Number(r.cbms_enabled ?? 0) === 1,
  };
}

export async function getCompany(): Promise<Company> {
  const res = await db().execute("SELECT * FROM company WHERE id = 1");
  return res.rows[0] ? mapCompany(res.rows[0]) : { ...DEFAULTS };
}

export async function saveCompany(c: Company): Promise<void> {
  await db().execute({
    sql: `INSERT INTO company
            (id, name, address, phone, pan_no, dda_no, vat_registered, invoice_footer,
             logo_url, print_format, rounding_on, expiry_alert_days, min_rate_is_cost,
             cbms_enabled, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            address = excluded.address,
            phone = excluded.phone,
            pan_no = excluded.pan_no,
            dda_no = excluded.dda_no,
            vat_registered = excluded.vat_registered,
            invoice_footer = excluded.invoice_footer,
            logo_url = excluded.logo_url,
            print_format = excluded.print_format,
            rounding_on = excluded.rounding_on,
            expiry_alert_days = excluded.expiry_alert_days,
            min_rate_is_cost = excluded.min_rate_is_cost,
            cbms_enabled = excluded.cbms_enabled,
            updated_at = excluded.updated_at`,
    args: [
      c.name,
      c.address,
      c.phone,
      c.panNo,
      c.ddaNo,
      c.vatRegistered ? 1 : 0,
      c.invoiceFooter,
      c.logoUrl,
      c.printFormat,
      c.roundingOn ? 1 : 0,
      c.expiryAlertDays,
      c.minRateIsCost ? 1 : 0,
      c.cbmsEnabled ? 1 : 0,
      new Date().toISOString(),
    ],
  });
}
