"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { saveDoctorAction } from "@/app/(app)/settings/catalog-actions";
import { describeShare, SHARE_BASIS_LABEL, type ShareBasis } from "@/lib/clinic-calc";
import { strings } from "@/lib/strings";
import type { Doctor } from "@/lib/repos/doctors";

interface FormState {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  shareBasis: ShareBasis;
  /** what the person types: a percentage, or rupees for a fixed amount */
  shareEntry: string;
  active: boolean;
}

const BLANK: FormState = {
  name: "",
  qualification: "",
  specialty: "",
  nmcNo: "",
  phone: "",
  shareBasis: "none",
  shareEntry: "",
  active: true,
};

const isPercent = (b: ShareBasis) => b === "pct_consult" || b === "pct_services";

/**
 * What the person typed → what is stored.
 *
 * A percentage is stored as basis points and a fixed amount as paisa, and both
 * happen to be the typed number times a hundred — 40% is 4000 basis points,
 * Rs 150 is 15000 paisa. One expression, not because the two are the same
 * thing, but because the arithmetic is.
 */
function toStoredValue(entry: string): number {
  const n = Number(entry.trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** What the database stores → what the person sees in the box. */
function toEntry(basis: ShareBasis, value: number): string {
  if (basis === "none" || value === 0) return "";
  return String(value / 100);
}

export function DoctorsManager({ initial }: { initial: Doctor[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function openNew() {
    setEditId(null);
    setForm(BLANK);
    setOpen(true);
  }

  function openEdit(d: Doctor) {
    setEditId(d.id);
    setForm({
      name: d.name,
      qualification: d.qualification,
      specialty: d.specialty,
      nmcNo: d.nmcNo,
      phone: d.phone,
      shareBasis: d.shareBasis,
      shareEntry: toEntry(d.shareBasis, d.shareValue),
      active: d.active,
    });
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    const res = await saveDoctorAction(editId, {
      name: form.name.trim(),
      qualification: form.qualification.trim(),
      specialty: form.specialty.trim(),
      nmcNo: form.nmcNo.trim(),
      phone: form.phone.trim(),
      shareBasis: form.shareBasis,
      shareValue: toStoredValue(form.shareEntry),
      active: form.active,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? strings.saved : "Doctor added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[13px] text-sage-500">
          A doctor here is a name on a slip and a share of the takings. Giving
          someone a way to log in is a separate thing, under Users.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add doctor
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          message="No doctors yet. Add the doctors who see patients here."
        />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Qualification</TH>
                <TH>Specialty</TH>
                <TH>NMC no.</TH>
                <TH>Share</TH>
                <TH>Status</TH>
                <TH> </TH>
              </TR>
            </THead>
            <tbody>
              {initial.map((d) => (
                <TR key={d.id}>
                  <TD className="font-medium text-sage-900">{d.name}</TD>
                  <TD className="text-sage-500">{d.qualification || "—"}</TD>
                  <TD className="text-sage-500">{d.specialty || "—"}</TD>
                  <TD className="font-mono text-[13px]">{d.nmcNo || "—"}</TD>
                  <TD>
                    {describeShare({ basis: d.shareBasis, value: d.shareValue })}
                  </TD>
                  <TD>
                    <Badge tone={d.active ? "ok" : "neutral"}>
                      {d.active ? "Active" : "Off"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <button
                      onClick={() => openEdit(d)}
                      className="text-[13px] text-clinic-700 hover:underline"
                    >
                      Edit
                    </button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit doctor" : "Add doctor"}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              placeholder="Dr. Sunita Karki"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Qualification" hint="Printed under the name on a slip">
              <Input
                value={form.qualification}
                onChange={(e) => set("qualification", e.target.value)}
                placeholder="MBBS, MD"
              />
            </Field>
            <Field label="Specialty">
              <Input
                value={form.specialty}
                onChange={(e) => set("specialty", e.target.value)}
                placeholder="General Medicine"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="NMC number">
              <Input
                value={form.nmcNo}
                onChange={(e) => set("nmcNo", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="What the doctor takes"
            hint="Changing this affects bills from now on. Bills already saved keep the share they were made with."
          >
            <Select
              value={form.shareBasis}
              onChange={(e) => set("shareBasis", e.target.value as ShareBasis)}
            >
              {(Object.keys(SHARE_BASIS_LABEL) as ShareBasis[]).map((b) => (
                <option key={b} value={b}>
                  {SHARE_BASIS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>

          {form.shareBasis !== "none" && (
            <Field
              label={isPercent(form.shareBasis) ? "Percentage" : "Amount per consultation"}
              hint={
                isPercent(form.shareBasis)
                  ? "For example 40 for forty percent"
                  : "In rupees"
              }
            >
              <Input
                numeric
                value={form.shareEntry}
                onChange={(e) => set("shareEntry", e.target.value)}
                placeholder={isPercent(form.shareBasis) ? "40" : "150"}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4"
            />
            Currently seeing patients
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : strings.save}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
