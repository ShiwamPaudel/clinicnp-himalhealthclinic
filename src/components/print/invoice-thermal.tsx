import { formatPaisa } from "@/lib/money";
import type { PrintBill } from "@/lib/print-types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  qr: "QR / digital wallet",
  credit: "Credit",
};

/** 80mm thermal invoice (default). Pure black on white (Design.md §5). */
export function InvoiceThermal({ bill }: { bill: PrintBill }) {
  const c = bill.company;
  return (
    <div className="invoice-thermal">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Pharmacy"}</div>
        {c.address && <div>{c.address}</div>}
        {c.phone && <div>Ph: {c.phone}</div>}
        <div style={{ fontWeight: 600 }}>PAN: {c.panNo || "—"}</div>
        {c.ddaNo && <div>DDA: {c.ddaNo}</div>}
      </div>

      <div className="dashed" />
      <div>
        <div>
          Bill: {bill.invoiceLabel}
          {bill.provisional ? " (pending)" : ""}
        </div>
        <div>{bill.dateBsLong} {bill.timeStr}</div>
        {bill.patient ? (
          <div>
            Patient:{" "}
            {bill.patient.patientNo != null
              ? `P-${String(bill.patient.patientNo).padStart(6, "0")} `
              : ""}
            {bill.patient.name} · {bill.patient.ageSex}
          </div>
        ) : (
          bill.patientName && <div>Patient: {bill.patientName}</div>
        )}
        <div>By: {bill.userName}</div>
      </div>
      <div className="dashed" />

      {/* Services first, then medicines — the order the clinic reads them in
          (Design.md §6). Each block is labelled only when both are present. */}
      {(bill.serviceLines?.length ?? 0) > 0 && (
        <>
          {bill.lines.length > 0 && (
            <div style={{ fontWeight: 600 }}>Services</div>
          )}
          {bill.serviceLines!.map((l, i) => (
            <div key={`s${i}`} style={{ marginBottom: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{l.name}</span>
                <span>{formatPaisa(l.amountPaisa, false)}</span>
              </div>
              <div>
                {l.qty} × {formatPaisa(l.ratePaisa, false)}
                {l.rateOverridden ? "*" : ""}
                {l.discountPaisa > 0
                  ? ` − ${formatPaisa(l.discountPaisa, false)}`
                  : ""}
              </div>
              {l.doctorName && <div style={{ fontSize: 9 }}>{l.doctorName}</div>}
              {l.followupNote && (
                <div style={{ fontSize: 9 }}>{l.followupNote}</div>
              )}
            </div>
          ))}
          {bill.lines.length > 0 && (
            <>
              <div className="dashed" />
              <div style={{ fontWeight: 600 }}>Medicines</div>
            </>
          )}
        </>
      )}

      {bill.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {l.name}
              {l.controlled ? " [Rx]" : ""}
            </span>
            <span>{formatPaisa(l.amountPaisa, false)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {l.qty} {l.unitName} × {formatPaisa(l.ratePaisa, false)}
              {l.rateOverridden ? "*" : ""}
              {l.discountPaisa > 0 ? ` − ${formatPaisa(l.discountPaisa, false)}` : ""}
            </span>
          </div>
          {l.batches.map((b, j) => (
            <div key={j} style={{ fontSize: 9 }}>
              B/N {b.batchNo} · Exp {b.expiryBs}
            </div>
          ))}
        </div>
      ))}

      <div className="dashed" />
      <Row label="Subtotal" value={formatPaisa(bill.subtotalPaisa, false)} />
      {bill.billDiscountPaisa > 0 && (
        <Row label="Discount" value={`− ${formatPaisa(bill.billDiscountPaisa, false)}`} />
      )}
      {c.vatRegistered && (
        <Row label="VAT (13%)" value={formatPaisa(bill.vatPaisa, false)} />
      )}
      <div style={{ fontWeight: 700, fontSize: 12 }}>
        <Row label="TOTAL" value={formatPaisa(bill.totalPaisa, false)} />
      </div>
      <div className="dashed" />
      <Row label={METHOD_LABEL[bill.paymentMethod] ?? "Cash"} value="" />
      {bill.paymentMethod === "cash" && (
        <>
          <Row label="Tendered" value={formatPaisa(bill.tenderedPaisa, false)} />
          <Row label="Change" value={formatPaisa(bill.changePaisa, false)} />
        </>
      )}
      <div className="dashed" />
      <div style={{ textAlign: "center" }}>{c.invoiceFooter || "Get well soon"}</div>
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
