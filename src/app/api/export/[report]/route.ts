import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { resolveRange } from "@/lib/date-range";
import {
  salesRegister,
  purchaseRegister,
  profitByItem,
  movingItems,
} from "@/lib/repos/reports";
import { formatDocNo } from "@/lib/invoice-number";
import { adToIso } from "@/lib/bs";

/** Money as a plain 2-decimal number for spreadsheet cells. */
function rupees(paisa: number): number {
  return Math.round(paisa) / 100;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  const { report } = await params;
  const url = new URL(req.url);
  const range = resolveRange({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "ClinicNP";
  const ws = wb.addWorksheet("Report");

  if (report === "sales-register") {
    const rows = await salesRegister(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Invoice", key: "inv", width: 22 },
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Patient", key: "patient", width: 20 },
      { header: "Subtotal", key: "sub", width: 12 },
      { header: "Discount", key: "disc", width: 12 },
      { header: "VAT", key: "vat", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const r of rows) {
      ws.addRow({
        inv: r.invoiceNo != null ? formatDocNo("SI", r.fiscalLabel, r.invoiceNo) : "",
        date: r.dateBs,
        patient: r.patientName,
        sub: rupees(r.subtotalPaisa),
        disc: rupees(r.discountPaisa),
        vat: rupees(r.vatPaisa),
        total: rupees(r.totalPaisa),
        status: r.status,
      });
    }
  } else if (report === "purchase-register") {
    const rows = await purchaseRegister(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Purchase no.", key: "no", width: 20 },
      { header: "Supplier", key: "sup", width: 24 },
      { header: "Their invoice", key: "sinv", width: 16 },
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Subtotal", key: "sub", width: 12 },
      { header: "VAT", key: "vat", width: 12 },
      { header: "Total", key: "total", width: 12 },
    ];
    for (const r of rows) {
      ws.addRow({
        no: r.purchaseNo ?? "",
        sup: r.supplierName,
        sinv: r.supplierInvoiceNo,
        date: r.dateBs,
        sub: rupees(r.subtotalPaisa),
        vat: rupees(r.vatPaisa),
        total: rupees(r.totalPaisa),
      });
    }
  } else if (report === "profit") {
    const { rows } = await profitByItem(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Item", key: "item", width: 28 },
      { header: "Qty sold", key: "qty", width: 12 },
      { header: "Revenue", key: "rev", width: 14 },
      { header: "Cost", key: "cost", width: 14 },
      { header: "Profit", key: "profit", width: 14 },
      { header: "Margin %", key: "margin", width: 10 },
    ];
    for (const r of rows) {
      ws.addRow({
        item: r.brandName,
        qty: r.qty,
        rev: rupees(r.revenuePaisa),
        cost: rupees(r.costPaisa),
        profit: rupees(r.profitPaisa),
        margin: r.marginPct,
      });
    }
  } else if (report === "moving") {
    const rows = await movingItems(range.fromIso, range.toIso, adToIso(new Date()));
    ws.columns = [
      { header: "Item", key: "item", width: 28 },
      { header: "Qty sold", key: "qty", width: 12 },
      { header: "Value sold", key: "value", width: 14 },
      { header: "Dead stock (90d)", key: "dead", width: 16 },
    ];
    for (const r of rows) {
      ws.addRow({
        item: r.brandName,
        qty: r.qtySold,
        value: rupees(r.valuePaisa),
        dead: r.deadStock ? "Yes" : "No",
      });
    }
  } else {
    return NextResponse.json(
      { ok: false, userMessage: "Unknown report." },
      { status: 404 },
    );
  }

  ws.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${report}-${range.fromIso}_${range.toIso}.xlsx"`,
    },
  });
}
