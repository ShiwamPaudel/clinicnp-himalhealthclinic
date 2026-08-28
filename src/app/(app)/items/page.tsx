import Link from "next/link";
import { Plus, Package, Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { listItems } from "@/lib/repos/items";
import { itemStockMap } from "@/lib/repos/batches";
import { adToIso } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ItemsPage() {
  await requireAdmin();
  const [items, stock] = await Promise.all([
    listItems(true),
    itemStockMap(adToIso(new Date())),
  ]);

  return (
    <PageShell
      title="Items"
      actions={
        <Link href="/items/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          message="No items yet. Add your first medicine to start tracking stock."
          action={
            <Link href="/items/new">
              <Button>Add item</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Default rate</TH>
              <TH>In stock</TH>
              <TH>Status</TH>
              <TH>{""}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((item) => {
              const s = stock.get(item.id);
              const sellable = s?.sellableBaseQty ?? 0;
              const defaultUnit =
                item.units.find((u) => u.isDefaultSelling) ?? item.units[0];
              const low =
                item.minStockBaseQty > 0 && sellable < item.minStockBaseQty;
              return (
                <TR key={item.id}>
                  <TD>
                    <Link
                      href={`/items/${item.id}`}
                      className="font-medium text-sage-900 hover:text-sage-600"
                    >
                      {item.brandName}
                    </Link>
                    {item.genericName && (
                      <div className="text-[12px] text-sage-500">
                        {item.genericName}
                      </div>
                    )}
                  </TD>
                  <TD>
                    {defaultUnit
                      ? `${formatPaisa(defaultUnit.sellingRatePaisa)} / ${defaultUnit.name}`
                      : "—"}
                  </TD>
                  <TD>
                    {item.units.length > 0
                      ? toMixedDisplay(sellable, item.units)
                      : "—"}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {!item.active && <Badge tone="neutral">Inactive</Badge>}
                      {low && <Badge tone="warn">Low</Badge>}
                      {item.controlledFlag && <Badge tone="info">Rx</Badge>}
                      {item.active && !low && sellable > 0 && (
                        <Badge tone="ok">In stock</Badge>
                      )}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/items/${item.id}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-900 hover:bg-cream-200"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </PageShell>
  );
}
