import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listSuppliers } from "@/lib/repos/suppliers";
import { listRacks, cellCounts } from "@/lib/repos/racks";
import { PageShell } from "@/components/app/page-shell";
import { ItemForm } from "@/components/app/item-form";

export default async function NewItemPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [suppliers, racks, counts] = await Promise.all([
    listSuppliers(),
    listRacks(),
    cellCounts(),
  ]);
  return (
    <PageShell title="Add item">
      <ItemForm suppliers={suppliers} racks={racks} cellCounts={counts} />
    </PageShell>
  );
}
