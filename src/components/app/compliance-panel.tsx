"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { setCbmsEnabledAction } from "@/app/(app)/settings/actions";
import type { CbmsCounts } from "@/lib/repos/cbms";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export function CompliancePanel({
  enabled,
  endpointConfigured,
  counts,
}: {
  enabled: boolean;
  endpointConfigured: boolean;
  counts: CbmsCounts;
}) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !on;
    const res = await setCbmsEnabledAction(next);
    setBusy(false);
    if (res.ok) {
      setOn(next);
      toast.success(next ? "Reporting to IRD turned on" : "Reporting to IRD turned off");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-sage-900">
              Report bills to IRD (CBMS)
            </h2>
            <p className="mt-1 max-w-md text-[13px] text-sage-500">
              When on, each saved bill is sent to the IRD Central Billing system.
              Turn this on only after your pharmacy is registered.
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={busy || !endpointConfigured}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-[999px] transition-colors",
              on ? "bg-sage-700" : "bg-line",
              !endpointConfigured && "opacity-50",
            )}
            aria-pressed={on}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-cream-50 transition-transform",
                on ? "left-6" : "left-1",
              )}
            />
          </button>
        </div>
        {!endpointConfigured && (
          <p className="mt-3 rounded-[8px] bg-warn-100 px-3 py-2 text-[13px] text-warn-600">
            No connection details are set up yet. Add them before turning this on.
          </p>
        )}
      </div>

      <div className="rounded-[10px] border border-line bg-cream-50 p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
          Reporting status
        </h2>
        <div className="flex flex-wrap gap-6">
          <Stat label="Waiting to be reported" value={counts.pending} tone="info" />
          <Stat label="Reported" value={counts.sent} tone="ok" />
          <Stat label="Needs attention" value={counts.failed} tone="danger" />
        </div>
        <p className="mt-3 text-[13px] text-sage-500">
          {on
            ? counts.pending > 0
              ? `${counts.pending} ${counts.pending === 1 ? "bill is" : "bills are"} waiting to be reported.`
              : "All bills have been reported."
            : "Bills are being recorded and will be reported once you turn this on."}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "ok" | "danger";
}) {
  return (
    <div>
      <div className="text-[24px] font-bold text-sage-900 tnum">{value}</div>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}
