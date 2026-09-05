/**
 * catalog.ts — builds the counter's catalog snapshot.
 *
 * From v2 this is everything the counter can sell: medicines with their units
 * and live batches, and — when the Clinic module is on — services with the
 * doctors and laboratories they need. One snapshot, so one search box can
 * cover both without waiting on the network (Architecture §2.1).
 */
import "server-only";
import { listItems } from "@/lib/repos/items";
import { allBatchesWithStock, catalogVersion } from "@/lib/repos/batches";
import { listPosServices } from "@/lib/repos/services";
import { listDoctors } from "@/lib/repos/doctors";
import { listLabPartners } from "@/lib/repos/lab-partners";
import type { PosService, PosDoctor, PosLabPartner } from "@/lib/pos-types";

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
  services: PosService[];
  doctors: PosDoctor[];
  labPartners: PosLabPartner[];
}

/**
 * `includeClinic` is decided by the caller from the module flags, so a
 * pharmacy-only install never even ships a services array.
 */
export async function catalogSnapshot(
  includeClinic = false,
): Promise<CatalogSnapshot> {
  const [items, batches, version, services, doctors, labPartners] =
    await Promise.all([
      listItems(),
      allBatchesWithStock(),
      catalogVersion(),
      includeClinic ? listPosServices() : Promise.resolve([]),
      includeClinic ? listDoctors() : Promise.resolve([]),
      includeClinic ? listLabPartners() : Promise.resolve([]),
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
    services,
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.name,
      qualification: d.qualification,
      shareBasis: d.shareBasis,
      shareValue: d.shareValue,
    })),
    labPartners: labPartners.map((p) => ({ id: p.id, name: p.name })),
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
