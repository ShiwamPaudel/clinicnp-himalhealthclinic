/**
 * catalog.ts — builds the POS catalog snapshot (items + units + live batches).
 * Consumed by the offline catalog cache in Phase 3 (Architecture §2.1).
 */
import "server-only";
import { listItems } from "@/lib/repos/items";
import { allBatchesWithStock, catalogVersion } from "@/lib/repos/batches";

export interface CatalogBatch {
  id: string;
  batchNo: string;
  expiryDateAd: string;
  remainingBaseQty: number;
  costPaisaPerBase: number;
}

export interface CatalogItem {
  id: string;
  brandName: string;
  genericName: string;
  category: string;
  controlledFlag: boolean;
  shape: string;
  units: {
    level: number;
    name: string;
    factorToBase: number;
    sellingRatePaisa: number;
    isDefaultSelling: boolean;
  }[];
  batches: CatalogBatch[];
}

export interface CatalogSnapshot {
  version: string;
  items: CatalogItem[];
}

export async function catalogSnapshot(): Promise<CatalogSnapshot> {
  const [items, batches, version] = await Promise.all([
    listItems(),
    allBatchesWithStock(),
    catalogVersion(),
  ]);

  const batchesByItem = new Map<string, CatalogBatch[]>();
  for (const b of batches) {
    if (!batchesByItem.has(b.itemId)) batchesByItem.set(b.itemId, []);
    batchesByItem.get(b.itemId)!.push({
      id: b.id,
      batchNo: b.batchNo,
      expiryDateAd: b.expiryDateAd,
      remainingBaseQty: b.remainingBaseQty,
      costPaisaPerBase: b.costPaisaPerBase,
    });
  }

  return {
    version,
    items: items.map((i) => ({
      id: i.id,
      brandName: i.brandName,
      genericName: i.genericName,
      category: i.category,
      controlledFlag: i.controlledFlag,
      shape: i.shape,
      units: i.units,
      batches: batchesByItem.get(i.id) ?? [],
    })),
  };
}
