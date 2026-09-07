import { formatPaisa } from "@/lib/money";
import type { PrintBill } from "@/lib/print-types";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  qr: "QR / digital wallet",
  credit: "Credit",
};

/**
 * invoice-a4.tsx — the bill. One format, on the paper the shop actually has.
 *
 * Himal prints on a normal A4 sheet from a normal office printer, so that is
 * what this is: a full sheet, the shop's own letterhead image across the top,
 * and the invoice underneath it. There is no second format to choose between —
 * a print-format setting is a thing that gets set wrong once and then prints
 * wrong for a year.
 *
 * The header falls back to typed company details when no image is set, so a
 * shop that has not uploaded one yet still gets a complete, legal-looking
 * invoice rather than a blank band.
 */
export function InvoiceA4({ bill }: { bill: PrintBill }) {
  const c = bill.company;
  const hasServices = (bill.serviceLines?.length ?? 0) > 0;
  const hasMedicines = bill.lines.length > 0;

  return (
    <div className="invoice-a4">
      {/* ---- letterhead ---- */}
      {c.logoUrl ? (
        <div className="a4-letterhead">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.logoUrl} alt="" className="a4-letterhead-img" />
        </div>
      ) : (
        <div className="a4-letterhead a4-letterhead-text">
          <div className="shop-name">{c.name || "Pharmacy"}</div>
          <div>
            {[c.address, c.phone ? `Ph: ${c.phone}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      )}

      {/* The registration numbers stay as text even behind an image header:
          they are what makes it a tax invoice, and an image cannot be relied
          on to carry a number somebody may need to read back. */}
      <div className="a4-regline">
        <span>PAN: {c.panNo || "—"}</span>
        {c.ddaNo && <span>DDA: {c.ddaNo}</span>}
        {c.logoUrl && c.phone && <span>Ph: {c.phone}</span>}
      </div>

      <div className="a4-title">
        {c.vatRegistered ? "TAX INVOICE" : "INVOICE"}
      </div>

      {/* ---- who and when ---- */}
      <div className="a4-meta">
        <div>
          {bill.patient ? (
            <>
              <div>
                <span className="a4-k">Patient</span>
                {bill.patient.patientNo != null
                  ? `P-${String(bill.patient.patientNo).padStart(6, "0")} · `
                  : ""}
                {bill.patient.name}
              </div>
              <div>
                <span className="a4-k">Age / Sex</span>
                {bill.patient.ageSex}
              </div>
            </>
          ) : (
            <div>
              <span className="a4-k">Patient</span>
              {bill.patientName || "—"}
            </div>
          )}
          <div>
            <span className="a4-k">Payment</span>
            {METHOD_LABEL[bill.paymentMethod] ?? bill.paymentMethod}
          </div>
        </div>
        <div>
          <div>
            <span className="a4-k">Bill no.</span>
            <b>{bill.invoiceLabel}</b>
            {bill.provisional ? " (pending)" : ""}
          </div>
          <div>
            <span className="a4-k">Date</span>
            {bill.dateBsLong}
          </div>
          <div>
            <span className="a4-k">Time</span>
            {bill.timeStr}
          </div>
        </div>
      </div>

      {/* ---- services above medicines (Design.md §6) ---- */}
      {hasServices && (
        <table className="a4-table">
          <thead>
            <tr>
              <th className="a4-num">#</th>
              <th>Service</th>
              <th>Doctor</th>
              <th className="a4-r">Qty</th>
              <th className="a4-r">Rate</th>
              <th className="a4-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.serviceLines!.map((l, i) => (
              <tr key={`s-${i}`}>
                <td className="a4-num">{i + 1}</td>
                <td>
                  {l.name}
                  {l.followupNote && (
                    <div className="a4-sub">{l.followupNote}</div>
                  )}
                </td>
                <td>{l.doctorName || "—"}</td>
                <td className="a4-r">{l.qty}</td>
                <td className="a4-r">{formatPaisa(l.ratePaisa)}</td>
                <td className="a4-r">{formatPaisa(l.amountPaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMedicines && (
        <table className="a4-table">
          <thead>
            <tr>
              <th className="a4-num">#</th>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th className="a4-r">Qty</th>
              <th className="a4-r">Rate</th>
              <th className="a4-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l, i) => (
              <tr key={`m-${i}`}>
                <td className="a4-num">{(hasServices ? bill.serviceLines!.length : 0) + i + 1}</td>
                <td>
                  {l.name}
                  {l.controlled && <span className="a4-rx"> Rx</span>}
                  {l.genericName && <div className="a4-sub">{l.genericName}</div>}
                </td>
                <td>{l.batches.map((b) => b.batchNo).join(", ") || "—"}</td>
                <td>{l.batches.map((b) => b.expiryBs).join(", ") || "—"}</td>
                <td className="a4-r">
                  {l.qty} {l.unitName}
                </td>
                <td className="a4-r">{formatPaisa(l.ratePaisa)}</td>
                <td className="a4-r">{formatPaisa(l.amountPaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---- totals ---- */}
      <div className="a4-totals">
        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="a4-r">{formatPaisa(bill.subtotalPaisa)}</td>
            </tr>
            {bill.billDiscountPaisa > 0 && (
              <tr>
                <td>Discount</td>
                <td className="a4-r">− {formatPaisa(bill.billDiscountPaisa)}</td>
              </tr>
            )}
            {c.vatRegistered && bill.vatPaisa > 0 && (
              <tr>
                <td>VAT 13%</td>
                <td className="a4-r">{formatPaisa(bill.vatPaisa)}</td>
              </tr>
            )}
            <tr className="a4-grand">
              <td>Total</td>
              <td className="a4-r">{formatPaisa(bill.totalPaisa)}</td>
            </tr>
            {bill.paymentMethod === "cash" && bill.tenderedPaisa > 0 && (
              <>
                <tr>
                  <td>Tendered</td>
                  <td className="a4-r">{formatPaisa(bill.tenderedPaisa)}</td>
                </tr>
                <tr>
                  <td>Change</td>
                  <td className="a4-r">{formatPaisa(bill.changePaisa)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- foot ---- */}
      <div className="a4-foot">
        <div className="a4-sign">
          <div className="a4-sign-line" />
          <div>Received by</div>
        </div>
        <div className="a4-sign">
          <div className="a4-sign-line" />
          <div>For {c.name || "the pharmacy"}</div>
        </div>
      </div>

      <div className="a4-thanks">{c.invoiceFooter || "Get well soon"}</div>
      <div className="a4-by">Billed by {bill.userName}</div>
    </div>
  );
}
