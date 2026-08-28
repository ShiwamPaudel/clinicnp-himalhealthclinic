/**
 * fiscal.ts — fiscal-year bootstrap and lookup.
 * Fiscal year = Shrawan 1 -> Ashadh end (PRD 4.5.1). Invoice numbers restart each year.
 */
import "server-only";
import { db } from "@/lib/db";
import {
  adToIso,
  fiscalYearAdRange,
  fiscalYearOf,
  today,
  type FiscalYear as FY,
} from "@/lib/bs";
import type { Row } from "@/lib/db";

export interface FiscalYearRow {
  id: number;
  bsLabel: string;
  startAd: string;
  endAd: string;
  nextInvoiceNo: number;
  nextReturnNo: number;
  nextPurchaseNo: number;
  active: boolean;
}

function mapFy(r: Row): FiscalYearRow {
  return {
    id: Number(r.id),
    bsLabel: r.bs_label as string,
    startAd: r.start_ad as string,
    endAd: r.end_ad as string,
    nextInvoiceNo: Number(r.next_invoice_no),
    nextReturnNo: Number(r.next_return_no),
    nextPurchaseNo: Number(r.next_purchase_no),
    active: Number(r.active) === 1,
  };
}

export async function getFiscalYearByLabel(
  label: string,
): Promise<FiscalYearRow | null> {
  const res = await db().execute({
    sql: "SELECT * FROM fiscal_years WHERE bs_label = ?",
    args: [label],
  });
  return res.rows[0] ? mapFy(res.rows[0]) : null;
}

export async function getActiveFiscalYear(): Promise<FiscalYearRow | null> {
  const res = await db().execute(
    "SELECT * FROM fiscal_years WHERE active = 1 ORDER BY id DESC LIMIT 1",
  );
  return res.rows[0] ? mapFy(res.rows[0]) : null;
}

/** Create a fiscal-year row from a computed FY (idempotent by label). */
export async function ensureFiscalYear(fy: FY): Promise<FiscalYearRow> {
  const existing = await getFiscalYearByLabel(fy.label);
  if (existing) return existing;
  const { startAd, endAd } = fiscalYearAdRange(fy);
  await db().execute({
    sql: `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active)
          VALUES (?, ?, ?, 1)`,
    args: [fy.label, adToIso(startAd), adToIso(endAd)],
  });
  const created = await getFiscalYearByLabel(fy.label);
  if (!created) throw new Error("failed to create fiscal year");
  return created;
}

/** Bootstrap the current fiscal year derived from today's BS date. */
export async function bootstrapCurrentFiscalYear(): Promise<FiscalYearRow> {
  const fy = fiscalYearOf(today());
  return ensureFiscalYear(fy);
}
