"use client";

/**
 * outbox.ts — the pending-bill queue. Bills save here first (survives reload),
 * then a background loop POSTs them to the idempotent /api/bills. On ack they
 * leave the outbox; on failure they retry with exponential backoff (Architecture §2.1).
 */
import { posDB } from "@/offline/idb";
import type { OutboxBill } from "@/lib/pos-types";

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 240_000]; // cap 4 min

async function notify() {
  const count = await pendingCount();
  for (const l of listeners) l(count);
}

/** Subscribe to the pending-count (for the header status chip). */
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void pendingCount().then(listener);
  return () => listeners.delete(listener);
}

export async function pendingCount(): Promise<number> {
  const db = await posDB();
  return db.count("outbox");
}

export async function enqueueBill(bill: OutboxBill): Promise<void> {
  const db = await posDB();
  await db.put("outbox", bill);
  await notify();
}

export async function listOutbox(): Promise<OutboxBill[]> {
  const db = await posDB();
  return db.getAll("outbox");
}

async function removeBill(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("outbox", id);
  await notify();
}

async function updateBill(bill: OutboxBill): Promise<void> {
  const db = await posDB();
  await db.put("outbox", bill);
}

export interface SyncOneResult {
  ok: boolean;
  invoiceNo?: number;
  fiscalLabel?: string;
}

/** Try to send one queued bill. Returns whether it was accepted (and removed). */
async function syncOne(bill: OutboxBill): Promise<SyncOneResult> {
  try {
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bill.id,
        dateBs: bill.dateBs,
        dateAd: bill.dateAd,
        patientName: bill.patientName,
        paymentMethod: bill.paymentMethod,
        tenderedPaisa: bill.tenderedPaisa,
        billDiscountPaisa: bill.billDiscountPaisa,
        lines: bill.lines,
        clientCreatedAt: bill.clientCreatedAt,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      await removeBill(bill.id);
      return { ok: true, invoiceNo: data.invoiceNo, fiscalLabel: data.fiscalLabel };
    }
    // Surface the server's message (e.g. an insufficient-stock rejection from a
    // rare two-device offline race). It keeps retrying at backoff — which self-
    // heals once stock is entered — but the reason is now visible on the bill.
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.userMessage) msg = body.userMessage as string;
    } catch {
      /* body wasn't JSON */
    }
    bill.attempts += 1;
    bill.lastError = msg;
    await updateBill(bill);
    return { ok: false };
  } catch (err) {
    bill.attempts += 1;
    bill.lastError = err instanceof Error ? err.message : "network";
    await updateBill(bill);
    return { ok: false };
  }
}

let running = false;

/** Drain the outbox once (send everything currently pending, oldest first). */
export async function flushOutbox(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const bills = (await listOutbox()).sort((a, b) =>
      a.clientCreatedAt < b.clientCreatedAt ? -1 : 1,
    );
    for (const bill of bills) {
      await syncOne(bill);
    }
  } finally {
    running = false;
  }
}

let loopTimer: ReturnType<typeof setTimeout> | null = null;

/** Start the background retry loop (idempotent — safe to call once on mount). */
export function startOutboxLoop(): () => void {
  let stopped = false;
  let attempt = 0;

  async function tick() {
    if (stopped) return;
    const before = await pendingCount();
    if (before > 0 && navigator.onLine) {
      await flushOutbox();
    }
    const after = await pendingCount();
    // back off when items remain; reset when the queue drains
    attempt = after > 0 ? Math.min(attempt + 1, BACKOFF_MS.length - 1) : 0;
    const delay = after > 0 ? BACKOFF_MS[attempt]! : 30_000;
    if (!stopped) loopTimer = setTimeout(tick, delay);
  }

  const onOnline = () => void flushOutbox();
  window.addEventListener("online", onOnline);
  void tick();

  return () => {
    stopped = true;
    if (loopTimer) clearTimeout(loopTimer);
    window.removeEventListener("online", onOnline);
  };
}
