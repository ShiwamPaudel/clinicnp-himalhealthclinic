"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";
import Link from "next/link";
import { ArrowLeft, HelpCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useBillStore, linesFromHeld } from "@/stores/bill-store";
import {
  billTotals,
  linePreview,
  lineAmountPaisa,
  unitByLevel,
} from "@/lib/bill-calc";
import { change } from "@/lib/money";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import type { PosItem, OutboxBill, HeldBill } from "@/lib/pos-types";
import type { PrintBill, PrintLine } from "@/lib/print-types";
import {
  getCachedItems,
  syncCatalog,
  applyLocalAllocation,
} from "@/offline/catalog-cache";
import { enqueueBill, flushOutbox, startOutboxLoop } from "@/offline/outbox";
import { holdBill, listHeld, resumeHeld, MAX_HELD } from "@/offline/held";
import { SearchBox, type SearchBoxHandle } from "@/components/pos/search-box";
import { BillTable, type PosConfig } from "@/components/pos/bill-table";
import { PaymentPane, type PaymentPaneHandle } from "@/components/pos/payment-pane";
import { BatchPicker } from "@/components/pos/batch-picker";
import { UnitPanel } from "@/components/pos/unit-panel";
import { ShortcutSheet } from "@/components/pos/shortcut-sheet";
import { Wordmark } from "@/components/ui/wordmark";
import { StatusChip } from "@/components/pos/status-chip";
import { InvoiceThermal } from "@/components/print/invoice-thermal";
import { InvoiceA5 } from "@/components/print/invoice-a5";
import { useToast } from "@/components/ui/toast";
import { strings, npLabels } from "@/lib/strings";

export function PosScreen({ config }: { config: PosConfig }) {
  const toast = useToast();
  const [items, setItems] = useState<PosItem[]>([]);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [batchLineId, setBatchLineId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState<PrintBill | null>(null);
  const [stamp, setStamp] = useState(false);
  const [lang, setLang] = useState<"en" | "np">("en");

  const searchRef = useRef<SearchBoxHandle>(null);
  const paymentRef = useRef<PaymentPaneHandle>(null);

  const store = useBillStore();

  const refreshItems = useCallback(async () => {
    setItems(await getCachedItems());
  }, []);

  const refreshHeld = useCallback(async () => {
    setHeld(await listHeld());
  }, []);

  // initial load: pull catalog, start the outbox retry loop, restore label pref
  useEffect(() => {
    (async () => {
      await syncCatalog();
      await refreshItems();
      await refreshHeld();
    })();
    const saved = localStorage.getItem("pos-lang");
    if (saved === "np" || saved === "en") setLang(saved);
    const stop = startOutboxLoop();
    return stop;
  }, [refreshItems, refreshHeld]);

  // re-sync the catalog when the tab regains focus (catch stock changes)
  useEffect(() => {
    const onFocus = () => void (async () => {
      if (await syncCatalog()) await refreshItems();
    })();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshItems]);

  function toggleLang() {
    setLang((l) => {
      const next = l === "en" ? "np" : "en";
      localStorage.setItem("pos-lang", next);
      return next;
    });
  }

  const addItem = useCallback(
    (item: PosItem) => {
      useBillStore.getState().addItem(item);
    },
    [],
  );

  const doSave = useCallback(async () => {
    const s = useBillStore.getState();
    if (s.lines.length === 0) return;
    const hasControlled = s.lines.some((l) => l.item.controlledFlag);
    if (hasControlled && s.patientName.trim() === "") {
      toast.error("Enter the patient name for the prescription item.");
      return;
    }
    // Hard block: never sell more than the on-hand, non-expired stock.
    const short = s.lines.filter(
      (l) => linePreview(l, config.todayIso).shortfallBaseQty > 0,
    );
    if (short.length > 0) {
      const names = Array.from(
        new Set(short.map((l) => l.item.brandName)),
      ).join(", ");
      toast.error(
        `Not enough stock to sell: ${names}. Lower the quantity or add stock first.`,
      );
      return;
    }
    setSaving(true);
    const id = ulid();
    const nowIso = new Date().toISOString();

    // Build outbox payload + print lines from the shared FEFO preview.
    const outboxLines: OutboxBill["lines"] = [];
    const printLines: PrintLine[] = [];
    for (const line of s.lines) {
      const preview = linePreview(line, config.todayIso);
      outboxLines.push({
        id: line.lineId,
        itemId: line.item.id,
        unitLevel: line.unitLevel,
        qty: line.qty,
        ratePaisa: line.ratePaisa,
        rateOverridden: line.rateOverridden,
        discountPaisa: line.discountPaisa,
        overrideBatchId: line.overrideBatchId,
      });
      const unit = unitByLevel(line.item, line.unitLevel);
      printLines.push({
        name: line.item.brandName,
        genericName: line.item.genericName,
        controlled: line.item.controlledFlag,
        qty: line.qty,
        unitName: unit?.name ?? "",
        ratePaisa: line.ratePaisa,
        discountPaisa: line.discountPaisa,
        amountPaisa: lineAmountPaisa(line),
        rateOverridden: line.rateOverridden,
        batches: preview.allocations.map((a) => {
          const b = line.item.batches.find((x) => x.id === a.batchId);
          return {
            batchNo: b?.batchNo ?? "",
            expiryBs: b ? formatBS(toBS(adFromIso(b.expiryDateAd))) : "",
          };
        }),
      });
      // optimistic local stock decrement
      await applyLocalAllocation(line.item.id, preview.allocations);
    }

    const totals = billTotals(s.lines, s.billDiscountPaisa, {
      vatRegistered: config.vatRegistered,
      roundingOn: config.roundingOn,
    });

    const outbox: OutboxBill = {
      id,
      dateBs: config.todayBsText,
      dateAd: config.todayIso,
      patientName: s.patientName,
      paymentMethod: s.paymentMethod,
      tenderedPaisa: s.tenderedPaisa,
      billDiscountPaisa: s.billDiscountPaisa,
      lines: outboxLines,
      clientCreatedAt: nowIso,
      attempts: 0,
    };
    await enqueueBill(outbox);

    // provisional slip number until the server assigns the final invoice number
    setPrintBill({
      company: config.company,
      invoiceLabel: `Slip ${id.slice(-6).toUpperCase()}`,
      provisional: true,
      dateBsLong: config.todayBsLong,
      timeStr: new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      patientName: s.patientName,
      lines: printLines,
      subtotalPaisa: totals.subtotalPaisa,
      billDiscountPaisa: totals.billDiscountPaisa,
      vatPaisa: totals.vatPaisa,
      totalPaisa: totals.totalPaisa,
      paymentMethod: s.paymentMethod,
      tenderedPaisa: s.tenderedPaisa,
      changePaisa: change(s.tenderedPaisa, totals.totalPaisa),
      userName: config.userName,
    });

    // print on the next frame, then reset for the next customer
    requestAnimationFrame(() => {
      window.print();
    });

    setStamp(true);
    setTimeout(() => setStamp(false), 1000);

    store.reset();
    await refreshItems();
    setSaving(false);
    searchRef.current?.focus();

    // try to sync right away (no-op when offline; retries in the loop)
    void flushOutbox();
  }, [config, store, toast, refreshItems]);

  const doHold = useCallback(async () => {
    const s = useBillStore.getState();
    if (s.lines.length === 0) return;
    const bill: HeldBill = {
      id: ulid(),
      heldAt: new Date().toISOString(),
      patientName: s.patientName,
      lines: s.lines.map((l) => ({
        itemId: l.item.id,
        unitLevel: l.unitLevel,
        qty: l.qty,
        ratePaisa: l.ratePaisa,
        rateOverridden: l.rateOverridden,
        discountPaisa: l.discountPaisa,
        overrideBatchId: l.overrideBatchId,
      })),
    };
    const ok = await holdBill(bill);
    if (!ok) {
      toast.error(`You can hold up to ${MAX_HELD} bills.`);
      return;
    }
    store.reset();
    await refreshHeld();
    toast.success("Bill held");
    searchRef.current?.focus();
  }, [store, toast, refreshHeld]);

  const doResume = useCallback(
    async (heldId: string) => {
      const bill = await resumeHeld(heldId);
      if (!bill) return;
      const lines = linesFromHeld(bill.lines, items);
      useBillStore.getState().loadLines(lines, bill.patientName);
      await refreshHeld();
      setShowHeld(false);
    },
    [items, refreshHeld],
  );

  // global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F7") {
        e.preventDefault();
        void doHold();
      } else if (e.key === "F8") {
        e.preventDefault();
        setShowHeld((v) => !v);
      } else if (e.key === "F9") {
        e.preventDefault();
        void doSave();
      } else if (e.key === "?" && !typing) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHold, doSave]);

  const batchLine = batchLineId
    ? store.lines.find((l) => l.lineId === batchLineId)
    : null;
  // The active line drives the inline unit panel (last line if none focused).
  const activeLine =
    store.lines.find((l) => l.lineId === store.activeLineId) ??
    store.lines[store.lines.length - 1] ??
    null;

  return (
    <div className="flex h-screen flex-col bg-cream-100">
      {/* top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-cream-50 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-700 hover:bg-cream-200"
            title="Back to the app"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
          <Wordmark name={config.appName} className="text-[15px]" />
          <span className="hidden text-[14px] font-semibold text-sage-900 sm:inline">
            · New bill
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip />
          <button
            onClick={toggleLang}
            className="rounded-[8px] border border-line px-2 py-1 text-[12px] font-medium text-sage-700 hover:bg-cream-200"
            title="Switch labels"
          >
            {lang === "en" ? "नेप" : "EN"}
          </button>
          <button
            onClick={() => setShowHeld(true)}
            className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-sage-700 hover:bg-cream-200"
          >
            <PauseCircle className="h-4 w-4" />
            Held {held.length > 0 && `(${held.length})`}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            className="rounded-[8px] p-1.5 text-sage-500 hover:bg-cream-200"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* three zones */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
          <SearchBox
            ref={searchRef}
            items={items}
            todayIso={config.todayIso}
            onPick={addItem}
            onEmptyEnter={() => paymentRef.current?.focusTendered()}
          />
          <div className="mt-4 flex min-h-[160px] flex-col rounded-[10px] border border-line bg-cream-50 p-4">
            <BillTable config={config} onOpenBatch={(id) => setBatchLineId(id)} />
          </div>
          <UnitPanel
            line={activeLine}
            todayIso={config.todayIso}
            onSetQtyBase={(baseQty) => {
              if (!activeLine) return;
              store.setUnit(activeLine.lineId, 0);
              store.setQty(activeLine.lineId, baseQty);
              store.setActiveLine(activeLine.lineId);
            }}
          />
        </div>

        <div className="w-full shrink-0 lg:w-[340px]">
          <PaymentPane ref={paymentRef} config={config} saving={saving} lang={lang} onSave={doSave} />
        </div>
      </div>

      {/* dialogs */}
      <BatchPicker
        open={batchLineId !== null}
        onClose={() => setBatchLineId(null)}
        item={batchLine?.item ?? null}
        todayIso={config.todayIso}
        selectedBatchId={batchLine?.overrideBatchId}
        onChoose={(bid) =>
          batchLineId && store.setOverrideBatch(batchLineId, bid)
        }
      />
      <ShortcutSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <HeldTray
        open={showHeld}
        onClose={() => setShowHeld(false)}
        held={held}
        onResume={doResume}
      />

      {/* save stamp — the one moment that animates (Design §3) */}
      {stamp && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div className="rounded-[999px] border-2 border-magenta-600 bg-magenta-100/90 px-6 py-3 text-[20px] font-bold text-magenta-700 motion-safe:animate-[stamp_250ms_ease-out]">
            ✓ {strings.billSaved} · <span className="deva">{npLabels.billSaved}</span>
          </div>
          <style>{`@keyframes stamp{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:scale(1)}}`}</style>
        </div>
      )}

      {/* print area (hidden on screen) */}
      <div className="print-area">
        {printBill &&
          (config.printFormat === "a5" ? (
            <InvoiceA5 bill={printBill} />
          ) : (
            <InvoiceThermal bill={printBill} />
          ))}
      </div>
    </div>
  );
}

function HeldTray({
  open,
  onClose,
  held,
  onResume,
}: {
  open: boolean;
  onClose: () => void;
  held: HeldBill[];
  onResume: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-sage-950/30"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="mt-14 mr-4 w-80 rounded-[10px] border border-line bg-cream-50 p-4 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]"
      >
        <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
          Held bills
        </h2>
        {held.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-sage-500">
            No held bills.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {held.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => onResume(h.id)}
                  className="flex w-full items-center justify-between rounded-[8px] border border-line bg-cream-50 px-3 py-2.5 text-left hover:bg-cream-200"
                >
                  <span className="text-[14px] text-sage-900">
                    {h.patientName || `${h.lines.length} item${h.lines.length === 1 ? "" : "s"}`}
                  </span>
                  <PlayCircle className="h-4 w-4 text-sage-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
