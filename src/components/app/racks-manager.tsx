"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { RackMap } from "@/components/app/rack-map";
import { saveRackAction, deleteRackAction } from "@/app/(app)/settings/rack-actions";
import {
  FURNITURE_KINDS,
  FURNITURE_LABEL,
  DEFAULT_FURNITURE_KIND,
  type FurnitureKind,
} from "@/lib/furniture";
import type { Rack } from "@/lib/repos/racks";

interface FormState {
  name: string;
  kind: FurnitureKind;
  rows: string;
  cols: string;
  posX: number;
  posY: number;
  note: string;
}

const BLANK: FormState = {
  name: "",
  kind: DEFAULT_FURNITURE_KIND,
  rows: "4",
  cols: "5",
  posX: 0,
  posY: 0,
  note: "",
};

/** A desk is wide and shallow; a shelf is one long run. Racks are tall. */
const SHAPE_FOR_KIND: Record<FurnitureKind, { rows: string; cols: string }> = {
  rack: { rows: "4", cols: "5" },
  shelf: { rows: "1", cols: "6" },
  desk: { rows: "2", cols: "4" },
};

/** What the person typed, clamped to something drawable while they type. */
function side(entry: string): number {
  const n = Math.round(Number(entry));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 26);
}

export function RacksManager({
  initial,
  counts,
}: {
  initial: Rack[];
  /** rackId → "row:col" → how many items stand there. */
  counts: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);

  const placed = useMemo(
    () =>
      Object.values(counts).reduce(
        (sum, cells) => sum + Object.values(cells).reduce((s, n) => s + n, 0),
        0,
      ),
    [counts],
  );

  function openNew(at?: { posX: number; posY: number }) {
    setEditing(null);
    setForm({
      ...BLANK,
      name: `${FURNITURE_LABEL[DEFAULT_FURNITURE_KIND]} ${initial.length + 1}`,
      posX: at?.posX ?? nextFreeX(),
      posY: at?.posY ?? 0,
    });
    setOpen(true);
  }

  /**
   * Changing the kind renames and reshapes only while both still look
   * untouched. Somebody who typed "Cold shelf" and then realised it is a desk
   * should not lose the name, and somebody who set 3x7 should keep it.
   */
  function pickKind(kind: FurnitureKind) {
    setForm((f) => {
      const wasDefaultName =
        f.name === `${FURNITURE_LABEL[f.kind]} ${initial.length + 1}`;
      const wasDefaultShape =
        f.rows === SHAPE_FOR_KIND[f.kind].rows &&
        f.cols === SHAPE_FOR_KIND[f.kind].cols;
      return {
        ...f,
        kind,
        name: wasDefaultName
          ? `${FURNITURE_LABEL[kind]} ${initial.length + 1}`
          : f.name,
        rows: wasDefaultShape ? SHAPE_FOR_KIND[kind].rows : f.rows,
        cols: wasDefaultShape ? SHAPE_FOR_KIND[kind].cols : f.cols,
      };
    });
  }

  /** Somewhere on the end of the row that is not already occupied. */
  function nextFreeX(): number {
    if (initial.length === 0) return 0;
    return Math.max(...initial.map((r) => r.posX)) + 1;
  }

  function openEdit(rack: Rack) {
    setEditing(rack);
    setForm({
      name: rack.name,
      kind: rack.kind,
      rows: String(rack.rows),
      cols: String(rack.cols),
      posX: rack.posX,
      posY: rack.posY,
      note: rack.note,
    });
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    const res = await saveRackAction(editing?.id ?? null, {
      name: form.name.trim(),
      kind: form.kind,
      rows: side(form.rows),
      cols: side(form.cols),
      posX: form.posX,
      posY: form.posY,
      note: form.note.trim(),
      active: true,
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      toast.success("Saved");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  async function remove(rack: Rack) {
    const n = Object.values(counts[rack.id] ?? {}).reduce((s, x) => s + x, 0);
    const warning =
      n > 0
        ? `${rack.name} has ${n} item${n === 1 ? "" : "s"} on it. They will keep everything else but lose their place. Remove it?`
        : `Remove ${rack.name}?`;
    if (!confirm(warning)) return;
    const res = await deleteRackAction(rack.id);
    if (res.ok) {
      toast.success("Removed");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  const ghost = open
    ? {
        name: form.name || `New ${FURNITURE_LABEL[form.kind].toLowerCase()}`,
        kind: form.kind,
        rows: side(form.rows),
        cols: side(form.cols),
        posX: form.posX,
        posY: form.posY,
      }
    : null;

  // While editing an existing rack, draw the edit as a ghost rather than twice.
  const drawn = editing ? initial.filter((r) => r.id !== editing.id) : initial;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-sage-900">
            The shop floor
          </h2>
          <p className="text-[13px] text-sage-500">
            Draw the racks, shelves and desks the way they stand in the room.
            Put medicines on them in{" "}
            <Link href="/stock/shelves" className="underline hover:text-sage-700">
              Stock → Shelves
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus size={16} /> Add
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-cream-50 p-4">
        <RackMap racks={drawn} counts={counts} ghost={ghost} />
        {initial.length > 0 && (
          <p className="mt-3 text-[12px] text-sage-500">
            {placed === 0
              ? "Nothing is on these yet."
              : `${placed} item${placed === 1 ? " is" : "s are"} on these.`}{" "}
            <Link href="/stock/shelves" className="underline hover:text-sage-700">
              Put medicines on them
            </Link>
            .
          </p>
        )}
      </div>

      {initial.length > 0 && (
        <div className="flex flex-col gap-2">
          {initial.map((rack) => {
            const n = Object.values(counts[rack.id] ?? {}).reduce(
              (s, x) => s + x,
              0,
            );
            return (
              <div
                key={rack.id}
                className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-cream-50 px-4 py-2.5"
              >
                <span className="font-medium text-sage-900">{rack.name}</span>
                <span className="text-[13px] text-sage-500">
                  {FURNITURE_LABEL[rack.kind]} · {rack.rows} rows ×{" "}
                  {rack.cols} columns · {n} item{n === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[12px] text-sage-500">
                    Add another:
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => openNew({ posX: rack.posX - 1, posY: rack.posY })}
                  >
                    left
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openNew({ posX: rack.posX + 1, posY: rack.posY })}
                  >
                    right
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openNew({ posX: rack.posX, posY: rack.posY - 1 })}
                  >
                    above
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openNew({ posX: rack.posX, posY: rack.posY + 1 })}
                  >
                    below
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Edit ${rack.name}`}
                    onClick={() => openEdit(rack)}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${rack.name}`}
                    onClick={() => remove(rack)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Add to the shop floor"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || form.name.trim() === ""}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" htmlFor="rack-kind">
              <Select
                id="rack-kind"
                value={form.kind}
                onChange={(e) => pickKind(e.target.value as FurnitureKind)}
              >
                {FURNITURE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FURNITURE_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="rack-name">
              <Input
                id="rack-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={`${FURNITURE_LABEL[form.kind]} 1`}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rows" htmlFor="rack-rows">
              <Input
                id="rack-rows"
                numeric
                value={form.rows}
                onChange={(e) => setForm({ ...form, rows: e.target.value })}
              />
            </Field>
            <Field label="Columns" htmlFor="rack-cols">
              <Input
                id="rack-cols"
                numeric
                value={form.cols}
                onChange={(e) => setForm({ ...form, cols: e.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Note"
            htmlFor="rack-note"
            hint="Optional — what is kept here, if it helps."
          >
            <Input
              id="rack-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>

          <div className="rounded-[8px] border border-line bg-cream-100 p-3">
            <p className="mb-2 text-[12px] text-sage-500">
              This is how it will look.
            </p>
            <div className="overflow-x-auto">
              <RackMap racks={drawn} counts={counts} ghost={ghost} />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
