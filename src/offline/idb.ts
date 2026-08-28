"use client";

/**
 * idb.ts — the single IndexedDB database for the POS.
 * Stores: catalog (item cache), meta (catalog version), outbox (pending bills),
 * held (parked bills). Never use localStorage for bills/queue (Rules §6).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PosItem, OutboxBill, HeldBill } from "@/lib/pos-types";

interface PosDB extends DBSchema {
  catalog: { key: string; value: PosItem };
  meta: { key: string; value: string };
  outbox: { key: string; value: OutboxBill };
  held: { key: string; value: HeldBill };
}

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

export function posDB(): Promise<IDBPDatabase<PosDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PosDB>("faarma", 1, {
      upgrade(db) {
        db.createObjectStore("catalog", { keyPath: "id" });
        db.createObjectStore("meta");
        db.createObjectStore("outbox", { keyPath: "id" });
        db.createObjectStore("held", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}
