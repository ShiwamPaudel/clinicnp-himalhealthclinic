"use client";

/**
 * catalog-cache.ts — the POS reads items from this local cache so search never
 * waits on the network (Architecture §2.1). Synced from /api/catalog.
 */
import { posDB } from "@/offline/idb";
import type { PosItem, PosCatalog } from "@/lib/pos-types";

const VERSION_KEY = "catalog_version";

/** All cached items. */
export async function getCachedItems(): Promise<PosItem[]> {
  const db = await posDB();
  return db.getAll("catalog");
}

export async function getCachedVersion(): Promise<string | undefined> {
  const db = await posDB();
  return db.get("meta", VERSION_KEY);
}

/** Replace the cached catalog with a fresh snapshot. */
export async function replaceCatalog(catalog: PosCatalog): Promise<void> {
  const db = await posDB();
  const tx = db.transaction(["catalog", "meta"], "readwrite");
  await tx.objectStore("catalog").clear();
  for (const item of catalog.items) {
    await tx.objectStore("catalog").put(item);
  }
  await tx.objectStore("meta").put(catalog.version, VERSION_KEY);
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
