import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getBillDetail } from "@/lib/repos/bills";
import { returnedBaseByLine } from "@/lib/repos/sale-returns";
import { getCompany } from "@/lib/repos/company";
import { bsFromDbText, formatBS } from "@/lib/bs";
import { formatDocNo } from "@/lib/invoice-number";
import { PageShell } from "@/components/app/page-shell";
import {
  SaleReturnForm,
  type ReturnLineData,
} from "@/components/app/sale-return-form";

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const bill = await getBillDetail(id);
  if (!bill) notFound();
  const company = await getCompany();
  const returnedBase = await returnedBaseByLine(id);

  const invoiceLabel =
    bill.invoiceNo != null
      ? formatDocNo("SI", bill.fiscalLabel, bill.invoiceNo)
      : "Pending";

  const lines: ReturnLineData[] = bill.lines.map((l) => ({
    billLineId: l.id,
    itemId: l.itemId,
    name: l.brandName,
    unitName: l.unitName,
    factorToBase: l.factorToBase,
    soldQty: l.qty,
    alreadyReturnedUnits: Math.round(
      (returnedBase.get(l.id) ?? 0) / (l.factorToBase || 1),
    ),
    ratePaisa: l.ratePaisa,
    lineAmountPaisa: l.amountPaisa,
  }));

  return (
    <PageShell title={`Return — ${invoiceLabel}`}>
      <SaleReturnForm
        billId={id}
        invoiceLabel={invoiceLabel}
        company={{
          name: company.name,
          address: company.address,
          phone: company.phone,
          panNo: company.panNo,
          ddaNo: company.ddaNo,
          invoiceFooter: company.invoiceFooter,
          vatRegistered: company.vatRegistered,
        }}
        dateBsLong={formatBS(bsFromDbText(bill.dateBs), {
          form: "long",
          monthScript: "en",
        })}
        lines={lines}
      />
    </PageShell>
  );
}
