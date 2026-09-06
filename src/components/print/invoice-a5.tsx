import { formatPaisa } from "@/lib/money";
import type { PrintBill } from "@/lib/print-types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  qr: "QR / digital wallet",
  credit: "Credit",
};

/** A5 invoice. Mirrors the on-screen bill including the perforation rule. */
export function InvoiceA5({ bill }: { bill: PrintBill }) {
  const c = bill.company;
  return (
    <div className="invoice-a5">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="shop-name">{c.name || "Pharmacy"}</div>
          {c.address && <div>{c.address}</div>}
          {c.phone && <div>Ph: {c.phone}</div>}
          <div style={{ fontWeight: 600 }}>PAN: {c.panNo || "—"}</div>
          {c.ddaNo && <div>DDA: {c.ddaNo}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>TAX INVOICE</div>
          <div>{bill.invoiceLabel}{bill.provisional ? " (pending)" : ""}</div>
          <div>{bill.dateBsLong}</div>
          <div>{bill.timeStr}</div>
        </div>
      </div>

      {bill.patient ? (
        <div style={{ marginTop: 8 }}>
          Patient:{" "}
          {bill.patient.patientNo != null
            ? `P-${String(bill.patient.patientNo).padStart(6, "0")} `
            : ""}
          {bill.patient.name} · {bill.patient.ageSex}
        </div>
      ) : (
        bill.patientName && (
          <div style={{ marginTop: 8 }}>Patient: {bill.patientName}</div>
        )
      )}

      {/* The service block sits above the medicine block (Design.md §6). */}
      {(bill.serviceLines?.length ?? 0) > 0 && (
        <table
          style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #000", textAlign: "left" }}>
              <th style={{ padding: "4px 0" }}>Service</th>
              <th>Doctor</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.serviceLines!.map((l, i) => (
              <tr
                key={i}
                style={{ borderBottom: "1px solid #ddd", verticalAlign: "top" }}
              >
                <td style={{ padding: "4px 0" }}>
                  {l.name}
                  {l.followupNote && (
                    <div style={{ fontSize: 10, color: "#555" }}>
                      {l.followupNote}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 10 }}>{l.doctorName || "—"}</td>
                <td style={{ textAlign: "right" }}>{l.qty}</td>
                <td style={{ textAlign: "right" }}>
                  {formatPaisa(l.ratePaisa, false)}
                  {l.rateOverridden ? "*" : ""}
                </td>
                <td style={{ textAlign: "right" }}>
                  {formatPaisa(l.amountPaisa, false)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {bill.lines.length > 0 && (
      <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000", textAlign: "left" }}>
            <th style={{ padding: "4px 0" }}>Item</th>
            <th>Batch / Exp</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #ddd", verticalAlign: "top" }}>
              <td style={{ padding: "4px 0" }}>
                {l.name}
                {l.controlled ? " [Rx]" : ""}
                {l.genericName && (
                  <div style={{ fontSize: 10, color: "#555" }}>{l.genericName}</div>
                )}
              </td>
              <td style={{ fontSize: 10 }}>
                {l.batches.map((b, j) => (
                  <div key={j}>
                    {b.batchNo} · {b.expiryBs}
                  </div>
                ))}
              </td>
              <td style={{ textAlign: "right" }}>
                {l.qty} {l.unitName}
              </td>
              <td style={{ textAlign: "right" }}>
                {formatPaisa(l.ratePaisa, false)}
                {l.rateOverridden ? "*" : ""}
              </td>
              <td style={{ textAlign: "right" }}>{formatPaisa(l.amountPaisa, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      <div className="perforation" />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: "45%" }}>
          <Row label="Subtotal" value={formatPaisa(bill.subtotalPaisa, false)} />
          {bill.billDiscountPaisa > 0 && (
            <Row label="Discount" value={`− ${formatPaisa(bill.billDiscountPaisa, false)}`} />
          )}
          {c.vatRegistered && (
            <Row label="VAT (13%)" value={formatPaisa(bill.vatPaisa, false)} />
          )}
          <div style={{ fontWeight: 700, fontSize: 14, borderTop: "1px solid #000", marginTop: 4, paddingTop: 4 }}>
            <Row label="Grand total" value={formatPaisa(bill.totalPaisa, false)} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Row label={METHOD_LABEL[bill.paymentMethod] ?? "Cash"} value="" />
            {bill.paymentMethod === "cash" && (
              <>
                <Row label="Tendered" value={formatPaisa(bill.tenderedPaisa, false)} />
                <Row label="Change" value={formatPaisa(bill.changePaisa, false)} />
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 24 }}>
        {c.invoiceFooter || "Get well soon"}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
