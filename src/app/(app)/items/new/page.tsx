import { requireAdmin } from "@/lib/session";
import { listSuppliers } from "@/lib/repos/suppliers";
import { PageShell } from "@/components/app/page-shell";
import { ItemForm } from "@/components/app/item-form";

export default async function NewItemPage() {
  await requireAdmin();
  const suppliers = await listSuppliers();
  return (
    <PageShell title="Add item">
      <ItemForm suppliers={suppliers} />
    </PageShell>
  );
}
