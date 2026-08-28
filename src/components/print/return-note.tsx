import { formatPaisa } from "@/lib/money";
import type { PrintCompany } from "@/lib/print-types";

export interface ReturnNoteData {
  company: PrintCompany;
  returnLabel: string;
  againstInvoice: string;
  dateBsLong: string;
  lines: { name: string; qty: number; unitName: string; amountPaisa: number }[];
  totalPaisa: number;
}

/** Sales-return note (thermal-style). */
export function ReturnNote({ data }: { data: ReturnNoteData }) {
  const c = data.company;
  return (
    <div className="invoice-thermal">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Pharmacy"}</div>
        {c.address && <div>{c.address}</div>}
        <div style={{ fontWeight: 600 }}>PAN: {c.panNo || "—"}</div>
      </div>
      <div className="dashed" />
      <div style={{ fontWeight: 700, textAlign: "center" }}>SALES RETURN</div>
      <div>{data.returnLabel}</div>
      <div>Against: {data.againstInvoice}</div>
      <div>{data.dateBsLong}</div>
      <div className="dashed" />
      {data.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {l.name} ({l.qty} {l.unitName})
          </span>
          <span>{formatPaisa(l.amountPaisa, false)}</span>
        </div>
      ))}
      <div className="dashed" />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Refund</span>
        <span>{formatPaisa(data.totalPaisa, false)}</span>
      </div>
    </div>
  );
}
