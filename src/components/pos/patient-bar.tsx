"use client";

/**
 * patient-bar.tsx — the navy strip above the bill saying who this is for.
 *
 * Navy carries a person, never a thing (Design.md §1). It is empty and quiet
 * on a medicine-only bill, and it is required the moment a service line
 * appears — a consultation belongs to someone.
 *
 * `P` opens it from anywhere at the counter. Search is by name, phone or
 * patient number, and someone who has never been here can be registered from
 * inside it without leaving the bill.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { UserPlus, X, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatPatientNo } from "@/lib/patient-no";
import { AGE_UNIT_OPTIONS, type AgeUnit } from "@/lib/age";
import type { AttachedPatient } from "@/stores/bill-store";
import { cn } from "@/lib/cn";

interface Found {
  id: string;
  patientNo: number | null;
  name: string;
  sex: string;
  phone: string;
  ageShort: string;
}

export function PatientBar({
  patient,
  required,
  onAttach,
  onClear,
  openSignal,
}: {
  patient: AttachedPatient | null;
  /** true once a service line exists: the bill cannot be saved without someone */
  required: boolean;
  onAttach: (p: AttachedPatient) => void;
  onClear: () => void;
  /** incremented by the counter when `P` is pressed */
  openSignal: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sex: "f",
    ageValue: "",
    ageUnit: "y" as AgeUnit,
    phone: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      setRegistering(false);
    }
  }, [openSignal]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/patients/search?q=${encodeURIComponent(q.trim())}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const body = (await res.json()) as { patients: Found[] };
        setResults(body.patients ?? []);
      } else {
        setResults([]);
      }
    } catch {
      // Offline. Registering someone new still works in Phase 5; for now the
      // person is told plainly rather than left staring at an empty list.
      setResults([]);
    }
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 180);
    return () => clearTimeout(t);
  }, [query, search]);

  function attach(f: Found) {
    onAttach({
      id: f.id,
      patientNo: f.patientNo,
      name: f.name,
      sex: f.sex,
      ageShort: f.ageShort,
    });
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  async function registerAndAttach() {
    setBusy(true);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          sex: form.sex,
          ageValue: form.ageValue.trim() === "" ? null : Number(form.ageValue),
          ageUnit: form.ageValue.trim() === "" ? null : form.ageUnit,
          phone: form.phone.trim(),
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        patient?: Found;
        userMessage?: string;
      };
      if (!res.ok || !body.ok || !body.patient) {
        toast.error(body.userMessage ?? "Couldn't register them just now.");
        setBusy(false);
        return;
      }
      attach(body.patient);
      toast.success(`${body.patient.name} registered`);
      setRegistering(false);
      setForm({ name: "", sex: "f", ageValue: "", ageUnit: "y", phone: "" });
    } catch {
      toast.error("Couldn't register them just now. Check the connection.");
    }
    setBusy(false);
  }

  return (
    <>
      <div
        className={cn(
          "mb-3 flex items-center gap-3 rounded-[10px] px-4 py-2.5",
          patient
            ? "bg-clinic-900 text-cream-50"
            : required
              ? "border border-dashed border-clinic-500 bg-clinic-75"
              : "border border-line bg-cream-50",
        )}
      >
        {patient ? (
          <>
            <span className="font-mono text-[13px] text-clinic-150">
              {patient.patientNo != null
                ? formatPatientNo(patient.patientNo)
                : "Not numbered yet"}
            </span>
            <span className="text-[15px] font-semibold">{patient.name}</span>
            <span className="text-[13px] text-clinic-150">
              {patient.ageShort} · {patient.sex.toUpperCase()}
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-auto rounded-[6px] px-2 py-1 text-[13px] text-clinic-150 hover:bg-clinic-700"
            >
              Change
            </button>
            <button
              onClick={onClear}
              aria-label="Take the patient off this bill"
              className="rounded-[6px] p-1 text-clinic-150 hover:bg-clinic-700"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <span
              className={cn(
                "text-[14px]",
                required ? "font-medium text-clinic-700" : "text-sage-500",
              )}
            >
              {required
                ? "This bill has a service on it — say who it is for"
                : "No patient on this bill"}
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-700 hover:bg-cream-200"
            >
              <UserPlus className="h-4 w-4" />
              Attach patient
              <kbd className="ml-1 rounded-[4px] bg-sage-150 px-1 text-[11px]">P</kbd>
            </button>
          </>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={registering ? "Register a new patient" : "Who is this bill for?"}
      >
        {registering ? (
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sex">
                <Select
                  value={form.sex}
                  onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                >
                  <option value="f">Female</option>
                  <option value="m">Male</option>
                  <option value="o">Other</option>
                </Select>
              </Field>
              <Field label="Age">
                <Input
                  numeric
                  value={form.ageValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ageValue: e.target.value }))
                  }
                />
              </Field>
              <Field label="Unit">
                <Select
                  value={form.ageUnit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ageUnit: e.target.value as AgeUnit }))
                  }
                >
                  {AGE_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRegistering(false)}>
                Back to search
              </Button>
              <Button
                onClick={registerAndAttach}
                disabled={busy || !form.name.trim()}
              >
                {busy ? "Registering…" : "Register and attach"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-3">
              <Search className="h-4 w-4 text-sage-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone or patient number"
                className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-sage-300"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin text-sage-500" />}
            </div>

            {results.length > 0 && (
              <ul className="max-h-[320px] overflow-y-auto rounded-[8px] border border-line">
                {results.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => attach(f)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-cream-200"
                    >
                      <span>
                        <span className="text-[15px] font-medium text-sage-900">
                          {f.name}
                        </span>
                        <span className="ml-2 text-[13px] text-sage-500">
                          {f.ageShort} · {f.sex.toUpperCase()}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[12px] text-clinic-700">
                          {f.patientNo != null ? formatPatientNo(f.patientNo) : "—"}
                        </span>
                        <span className="block font-mono text-[12px] text-sage-500">
                          {f.phone || ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="px-1 text-[14px] text-sage-500">
                Nobody by that name yet.
              </p>
            )}

            <Button
              variant="secondary"
              onClick={() => {
                setForm((f) => ({ ...f, name: query.trim() }));
                setRegistering(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Register someone new
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
