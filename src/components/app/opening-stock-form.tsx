"use client";

/**
 * opening-stock-form.tsx — what was already on the shelf on day one.
 *
 * Until this existed, stock could only arrive through a purchase, so a shop
 * switching to ClinicNP had to invent a supplier and an invoice for medicines
 * it bought months ago from somebody it no longer owes (D-077). This records
 * the shelf as what it is: an opening balance, with its own reason in the
 * ledger so the item's history never claims it was bought today.
 *
 * Built for one sitting at a counter with a shelf in front of you: many rows,
 * one save, and the medicine box focused on the row you just added. A new row
 * starts as a copy of the one above, because the next pack on a shelf is
 * usually the same medicine, cost or expiry with one thing changed (D-158).
 * Dates are typed the way the pack prints them (D-156) and the medicine is
 * found by typing its name (D-157).
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { ItemPicker } from "@/components/app/item-picker";
import { recordOpeningStockAction } from "@/app/(app)/stock/opening-actions";
import { toPaisa, formatPaisa } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import type { Item } from "@/lib/repos/items";

interface LineState {
  /** Stable across adds and removes, so each row keeps its own boxes. */
  key: number;
  itemId: string;
  unitLevel: number;
  batchNo: string;
  mfgDateBs: string;
  expiryDateBs: string;
  qty: string;
  costRupees: string;
}

let lastKey = 0;

function blankLine(): LineState {
  return {
    key: ++lastKey,
    itemId: "",
    unitLevel: 0,
    batchNo: "",
    mfgDateBs: "",
    expiryDateBs: "",
    qty: "1",
    costRupees: "0",
  };
}

/**
 * A row nobody has started. The quantity and cost are left out: they start
 * filled in, so they say nothing about whether the row was used.
 */
function isUntouched(l: LineState): boolean {
  return !l.itemId && !l.batchNo.trim() && !l.mfgDateBs && !l.expiryDateBs;
}

function lineCostPaisa(l: LineState): number {
  return (Number(l.qty) || 0) * toPaisa(Number(l.costRupees) || 0);
}

export function OpeningStockForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [lines, setLines] = useState<LineState[]>(() => [blankLine()]);
  const [busy, setBusy] = useState(false);
  const lastItemRef = useRef<HTMLInputElement>(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onItemChange(i: number, itemId: string) {
    const item = itemsById.get(itemId);
    // Default to the largest unit: a shelf is counted in boxes and strips far
    // more often than in loose tablets.
    const topLevel = item ? Math.max(...item.units.map((u) => u.level)) : 0;
    setLine(i, { itemId, unitLevel: topLevel });
  }

  function addLine() {
    // A copy of the row above, to be changed where the new pack differs.
    setLines((ls) => [...ls, { ...ls[ls.length - 1]!, key: ++lastKey }]);
    // Focus the new row's medicine box on the next frame, so a long shelf is
    // one continuous piece of typing rather than a reach for the mouse.
    requestAnimationFrame(() => lastItemRef.current?.focus());
  }

  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((_, x) => x !== i)));
  }

  /** Cost value of everything typed so far, so a wrong zero is visible. */
  const totalCost = useMemo(
    () => lines.reduce((sum, l) => (l.itemId ? sum + lineCostPaisa(l) : sum), 0),
    [lines],
  );

  const used = lines.filter((l) => !isUntouched(l));

  async function submit() {
    if (used.length === 0) {
      toast.error("Add at least one medicine.");
      return;
    }
    // Rows are numbered as on screen, untouched ones included, so "Medicine 3"
    // in a message is the box labelled Medicine 3.
    const seen = new Map<string, number>();
    for (const [i, l] of lines.entries()) {
      if (isUntouched(l)) continue;
      const n = i + 1;
      const item = itemsById.get(l.itemId);
      if (!item) {
        toast.error(`Medicine ${n}: choose the medicine from the list.`);
        return;
      }
      const name = `Medicine ${n} (${item.brandName})`;
      if (!l.batchNo.trim()) {
        toast.error(`${name}: enter the batch number.`);
        return;
      }
      if (!l.expiryDateBs) {
        toast.error(`${name}: enter the expiry date.`);
        return;
      }
      if (l.mfgDateBs && l.mfgDateBs > l.expiryDateBs) {
        toast.error(`${name}: it cannot expire before it was manufactured.`);
        return;
      }
      if ((Number(l.qty) || 0) <= 0) {
        toast.error(`${name}: enter how many.`);
        return;
      }
      // A copied row left unchanged would put the same batch on the shelf
      // twice, as two batches that each claim the full count.
      const sameBatch = `${l.itemId}|${l.batchNo.trim().toLowerCase()}`;
      const earlier = seen.get(sameBatch);
      if (earlier !== undefined) {
        toast.error(
          `Medicines ${earlier} and ${n} are both ${item.brandName}, batch ${l.batchNo.trim()}. ` +
            "Change the batch number, or remove one row and add its quantity to the other.",
        );
        return;
      }
      seen.set(sameBatch, n);
    }

    setBusy(true);
    const res = await recordOpeningStockAction({
      dateBs,
      lines: used.map((l) => ({
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        batchNo: l.batchNo.trim(),
        mfgDateBs: l.mfgDateBs || "",
        expiryDateBs: l.expiryDateBs,
        qty: Number(l.qty) || 0,
        costPaisaPerUnit: toPaisa(Number(l.costRupees) || 0),
      })),
    });
    setBusy(false);

    if (res.ok) {
      toast.success(
        `Opening stock recorded for ${used.length} item${used.length === 1 ? "" : "s"}.`,
      );
      setLines([blankLine()]);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
        <PackagePlus className="mx-auto mb-2 h-6 w-6 text-sage-500" />
        <p className="text-[15px] font-medium text-sage-900">No medicines yet</p>
        <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-sage-500">
          Opening stock says how much of each medicine is already on the shelf,
          so the medicines have to exist first. Add them under Items.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-sage-900">
            What is already on the shelf
          </h2>
          <p className="mt-1 max-w-[720px] text-[13px] text-sage-500">
            Use this once, when the software arrives, for stock you already own.
            It is not a purchase: no supplier, no invoice, and nothing owed to
            anybody. Everything bought afterwards goes through Purchases.
          </p>
          <p className="mt-2 max-w-[720px] text-[13px] text-sage-600">
            Type dates as the pack prints them: an expiry of{" "}
            <span className="font-medium text-sage-900">Nov 29</span> is 30 Nov
            2029, a manufacture date of{" "}
            <span className="font-medium text-sage-900">Nov 24</span> is 1 Nov
            2024. <span className="font-medium text-sage-900">Add another medicine</span>{" "}
            copies the row above, so change only what is different.
          </p>
        </div>
        <div className="w-full shrink-0 md:w-[220px]">
          <Field label="Counted on" htmlFor="opening-date">
            <DatePickerBS id="opening-date" value={dateBs} onChange={setDateBs} />
          </Field>
        </div>
      </div>

      {/* Sized by the room the form actually has, not the screen, so opening
          or folding the side menu changes the layout as it should. */}
      <div className="@container flex flex-col gap-3">
        {lines.map((l, i) => {
          const item = itemsById.get(l.itemId);
          const isLast = i === lines.length - 1;
          return (
            <div
              key={l.key}
              // Every box is a label over a control with nothing under it, so
              // the boxes on a line sit level; the row gap, and on one line the
              // bottom padding, leave room for the note a date box floats
              // beneath itself.
              //
              // One line wherever it fits: the fixed columns are measured to
              // hold their longest real value — a date box takes "32 Baishakh
              // 2088" whole, so a year is never cut off — and the medicine
              // takes what is left. That fits a 1366 px screen with the menu
              // open; with less room the row folds onto two lines.
              className={
                "grid grid-cols-1 items-end gap-x-3 gap-y-5 rounded-[10px] border border-line bg-cream-50 p-4 " +
                "@min-[560px]:grid-cols-2 " +
                "@min-[760px]:grid-cols-[minmax(0,2fr)_repeat(3,minmax(162px,1fr))] " +
                "@min-[1038px]:grid-cols-[minmax(150px,1fr)_108px_162px_162px_164px_92px_96px_36px] " +
                "@min-[1038px]:gap-x-1.5 @min-[1038px]:px-3 @min-[1038px]:pt-3 @min-[1038px]:pb-6"
              }
            >
              <div className="@min-[560px]:col-span-2 @min-[760px]:col-span-1">
                <Field label={`Medicine ${i + 1}`} htmlFor={`item-${i}`}>
                  <ItemPicker
                    id={`item-${i}`}
                    ref={isLast ? lastItemRef : undefined}
                    items={items}
                    value={l.itemId}
                    onChange={(id) => onItemChange(i, id)}
                    placeholder="Type a name, or pick from the list"
                  />
                </Field>
              </div>

              <Field label="Batch number" htmlFor={`batch-${i}`}>
                <Input
                  id={`batch-${i}`}
                  value={l.batchNo}
                  onChange={(e) => setLine(i, { batchNo: e.target.value })}
                  placeholder="e.g. B-2201"
                />
              </Field>

              <Field label="Mfg date (optional)" htmlFor={`mfg-${i}`}>
                <DatePickerBS
                  id={`mfg-${i}`}
                  value={l.mfgDateBs}
                  onChange={(v) => setLine(i, { mfgDateBs: v })}
                  placeholder="e.g. Nov 24"
                  typeMonthAs="start"
                  clearable
                />
              </Field>

              <Field label="Expiry date" htmlFor={`exp-${i}`}>
                <DatePickerBS
                  id={`exp-${i}`}
                  value={l.expiryDateBs}
                  onChange={(v) => setLine(i, { expiryDateBs: v })}
                  placeholder="e.g. Nov 29"
                  typeMonthAs="end"
                />
              </Field>

              <Field label="How many" htmlFor={`qty-${i}`}>
                <div className="flex gap-2 @min-[1038px]:gap-1.5">
                  {/* Sized by its wrapper: the box's own w-full would beat a
                      width class passed to it, and squeeze the unit out. */}
                  <div className="w-24 shrink-0 @min-[1038px]:w-[60px]">
                    <Input
                      id={`qty-${i}`}
                      numeric
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) =>
                        setLine(i, { qty: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </div>
                  <Select
                    value={String(l.unitLevel)}
                    onChange={(e) =>
                      setLine(i, { unitLevel: Number(e.target.value) })
                    }
                    disabled={!item}
                    aria-label={`Unit for medicine ${i + 1}`}
                    className="min-w-0 disabled:text-sage-300"
                  >
                    {item ? (
                      item.units.map((u) => (
                        <option key={u.level} value={u.level}>
                          {u.name}
                        </option>
                      ))
                    ) : (
                      <option value={l.unitLevel}>Unit</option>
                    )}
                  </Select>
                </div>
              </Field>

              <Field label="Cost each (रू)" htmlFor={`cost-${i}`}>
                <Input
                  id={`cost-${i}`}
                  numeric
                  inputMode="decimal"
                  value={l.costRupees}
                  onChange={(e) => setLine(i, { costRupees: e.target.value })}
                />
              </Field>

              {/* On one line this wrapper steps aside (display: contents), so
                  the value and the remove button take a column each. */}
              <div className="flex items-end justify-between gap-3 @min-[760px]:col-span-2 @min-[760px]:justify-end @min-[1038px]:contents">
                <div className="flex flex-col gap-1.5 @min-[760px]:items-end">
                  {/* रू lives in the label, so a value in the lakhs still fits
                      its column on one line without running into the cost. */}
                  <span className="whitespace-nowrap text-[13px] font-medium text-sage-900">
                    Line value (रू)
                  </span>
                  <span className="flex h-10 items-center whitespace-nowrap text-[15px] font-semibold text-sage-900 tnum @min-[1038px]:text-[14px]">
                    {item ? formatPaisa(lineCostPaisa(l), false) : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  aria-label={`Remove medicine ${i + 1}`}
                  className="flex h-10 w-10 items-center justify-center self-end rounded-[8px] text-danger-600 hover:bg-danger-100 @min-[1038px]:w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={addLine}>
          <Plus className="h-4 w-4" />
          Add another medicine
        </Button>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
              Value at cost · {used.length} {used.length === 1 ? "row" : "rows"}
            </div>
            <div className="text-[18px] font-bold text-sage-900 tnum">
              {formatPaisa(totalCost)}
            </div>
          </div>
          <Button onClick={submit} disabled={busy || used.length === 0}>
            {busy ? "…" : `Record opening stock`}
          </Button>
        </div>
      </div>
    </div>
  );
}
