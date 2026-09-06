"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { RackMap } from "@/components/app/rack-map";
import { saveRackAction, deleteRackAction } from "@/app/(app)/settings/rack-actions";
import type { Rack } from "@/lib/repos/racks";

interface FormState {
  name: string;
  rows: string;
  cols: string;
  posX: number;
  posY: number;
  note: string;
}

const BLANK: FormState = { name: "", rows: "4", cols: "5", posX: 0, posY: 0, note: "" };

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
  counts: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rack | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);

  function openNew(at?: { posX: number; posY: number }) {
    setEditing(null);
    setForm({
      ...BLANK,
      name: `Rack ${initial.length + 1}`,
      posX: at?.posX ?? nextFreeX(),
      posY: at?.posY ?? 0,
    });
    setOpen(true);
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
        ? `${rack.name} has ${n} item${n === 1 ? "" : "s"} on it. They will keep everything else but lose their shelf. Remove the rack?`
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
        name: form.name || "New rack",
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
            Where things are kept
          </h2>
          <p className="text-[13px] text-sage-500">
            Draw the racks the way they stand in the shop. The counter can then
            light up the shelf a medicine is on.
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus size={16} /> Add a rack
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-cream-50 p-4">
        <RackMap racks={drawn} counts={counts} ghost={ghost} />
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
                  {rack.rows} rows × {rack.cols} columns · {n} item
                  {n === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[12px] text-sage-500">
                    Add another rack:
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
                  <Button variant="ghost" onClick={() => openEdit(rack)}>
                    <Pencil size={15} />
                  </Button>
                  <Button variant="ghost" onClick={() => remove(rack)}>
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
        title={editing ? `Edit ${editing.name}` : "Add a rack"}
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
          <Field label="Name" htmlFor="rack-name">
            <Input
              id="rack-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Rack 1"
            />
          </Field>
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
