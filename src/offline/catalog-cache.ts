"use client";

/**
 * catalog-cache.ts — the counter reads medicines AND services from this local
 * cache so search never waits on the network (Architecture §2.1). Synced from
 * /api/catalog.
 */
import { posDB } from "@/offline/idb";
import type {
  PosItem,
  PosService,
  PosDoctor,
  PosLabPartner,
  PosCatalog,
} from "@/lib/pos-types";

const VERSION_KEY = "catalog_version";
const DOCTORS_KEY = "doctors";
const PARTNERS_KEY = "lab_partners";

/** All cached items. */
export async function getCachedItems(): Promise<PosItem[]> {
  const db = await posDB();
  return db.getAll("catalog");
}

/** All cached services. Empty when the clinic module is off. */
export async function getCachedServices(): Promise<PosService[]> {
  const db = await posDB();
  return db.getAll("services");
}

export async function getCachedDoctors(): Promise<PosDoctor[]> {
  const db = await posDB();
  const rows = await db.get("meta", DOCTORS_KEY);
  return Array.isArray(rows) ? (rows as PosDoctor[]) : [];
}

export async function getCachedLabPartners(): Promise<PosLabPartner[]> {
  const db = await posDB();
  const rows = await db.get("meta", PARTNERS_KEY);
  return Array.isArray(rows) ? (rows as PosLabPartner[]) : [];
}

export async function getCachedVersion(): Promise<string | undefined> {
  const db = await posDB();
  const v = await db.get("meta", VERSION_KEY);
  return typeof v === "string" ? v : undefined;
}

/** Replace the cached catalog with a fresh snapshot. */
export async function replaceCatalog(catalog: PosCatalog): Promise<void> {
  const db = await posDB();
  const tx = db.transaction(["catalog", "services", "meta"], "readwrite");
  await tx.objectStore("catalog").clear();
  for (const item of catalog.items) {
    await tx.objectStore("catalog").put(item);
  }
  await tx.objectStore("services").clear();
  for (const service of catalog.services ?? []) {
    await tx.objectStore("services").put(service);
  }
  await tx.objectStore("meta").put(catalog.version, VERSION_KEY);
  await tx.objectStore("meta").put(catalog.doctors ?? [], DOCTORS_KEY);
  await tx.objectStore("meta").put(catalog.labPartners ?? [], PARTNERS_KEY);
  await tx.done;
}

/**
 * Fetch the latest catalog and refresh the cache. Returns true on success.
 * Fails quietly when offline — the existing cache keeps working.
 */
export async function syncCatalog(): Promise<boolean> {
  try {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (!res.ok) return false;
    const catalog = (await res.json()) as PosCatalog;
    await replaceCatalog(catalog);
    return true;
  } catch {
    return false;
  }
}

/**
 * Optimistically decrement cached stock after a local save, so the next search
 * shows correct quantities immediately (server remains authoritative).
 */
export async function applyLocalAllocation(
  itemId: string,
  allocations: { batchId: string; baseQty: number }[],
): Promise<void> {
  const db = await posDB();
  const item = await db.get("catalog", itemId);
  if (!item) return;
  for (const a of allocations) {
    const batch = item.batches.find((b) => b.id === a.batchId);
    if (batch) batch.remainingBaseQty = Math.max(0, batch.remainingBaseQty - a.baseQty);
  }
  await db.put("catalog", item);
}
