"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { saveCompanyAction } from "@/app/(app)/settings/actions";
import type { Company } from "@/lib/repos/company";
import { strings } from "@/lib/strings";

export function CompanyForm({ initial }: { initial: Company }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, watch } = useForm<Company>({
    defaultValues: initial,
  });

  const values = watch();

  async function onSubmit(data: Company) {
    setSaving(true);
    const res = await saveCompanyAction({
      ...data,
      vatRegistered: Boolean(data.vatRegistered),
      roundingOn: Boolean(data.roundingOn),
      minRateIsCost: Boolean(data.minRateIsCost),
      expiryAlertDays: Number(data.expiryAlertDays) as 30 | 60 | 90,
      logoUrl: data.logoUrl || null,
      cbmsEnabled: initial.cbmsEnabled, // managed on the Compliance tab
    });
    setSaving(false);
    if (res.ok) toast.success(strings.saved);
    else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4 rounded-[10px] border border-line bg-cream-50 p-6"
      >
        <h2 className="text-[16px] font-semibold text-sage-900">
          {strings.companyDetails}
        </h2>

        <Field label={strings.pharmacyName} htmlFor="name">
          <Input id="name" {...register("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.phone} htmlFor="phone">
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label={strings.panNumber} htmlFor="pan">
            <Input id="pan" {...register("panNo")} />
          </Field>
        </div>
        <Field label={strings.address} htmlFor="address">
          <Input id="address" {...register("address")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.ddaNumber} htmlFor="dda">
            <Input id="dda" {...register("ddaNo")} />
          </Field>
          <Field label={strings.invoiceFooter} htmlFor="footer">
            <Input id="footer" {...register("invoiceFooter")} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={strings.printFormat} htmlFor="printFormat">
            <Select id="printFormat" {...register("printFormat")}>
              <option value="thermal">80 mm thermal</option>
              <option value="a5">A5</option>
            </Select>
          </Field>
          <Field label={strings.expiryAlertWindow} htmlFor="expiry">
            <Select id="expiry" {...register("expiryAlertDays")}>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("vatRegistered")} />
            {strings.vatRegistered}
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("roundingOn")} />
            {strings.roundGrandTotal}
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input type="checkbox" {...register("minRateIsCost")} />
            {strings.minRateIsCost}
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "…" : "Save details"}
          </Button>
        </div>
      </form>

      {/* Print-preview stub — proves PAN appears on invoices */}
      <div className="h-fit rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
          Invoice preview
        </div>
        <div className="rounded-[8px] border border-dashed border-line bg-white p-4 font-mono text-[12px] leading-relaxed text-sage-950">
          <div className="text-center font-sans text-[15px] font-bold">
            {values.name || "Your pharmacy name"}
          </div>
          <div className="text-center text-[11px]">
            {values.address || "Address"}
          </div>
          <div className="text-center text-[11px]">
            {values.phone ? `Ph: ${values.phone}` : "Ph: —"}
          </div>
          <div className="text-center text-[11px] font-semibold">
            PAN: {values.panNo || "—"}
          </div>
          {values.ddaNo && (
            <div className="text-center text-[11px]">DDA: {values.ddaNo}</div>
          )}
          <div className="my-2 border-t border-dashed border-line" />
          <div className="text-center text-[11px] text-sage-500">
            {values.invoiceFooter || "Get well soon"}
          </div>
        </div>
      </div>
    </div>
  );
}
