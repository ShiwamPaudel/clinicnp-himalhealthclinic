import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/app/header";
import { RangePicker } from "@/components/app/range-picker";
import { ExportButton } from "@/components/app/export-button";

/** Standard report frame: header, back link, range presets, optional export. */
export function ReportFrame({
  title,
  rangeLabel,
  preset,
  exportReport,
  showRange = true,
  children,
}: {
  title: string;
  rangeLabel: string;
  preset?: string;
  exportReport?: string;
  showRange?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header title={title} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/reports"
            className="flex items-center gap-1.5 text-[13px] text-sage-500 hover:text-sage-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All reports
          </Link>
          {exportReport && <ExportButton report={exportReport} />}
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {showRange ? (
            <RangePicker current={preset ?? ""} />
          ) : (
            <span />
          )}
          <span className="text-[13px] text-sage-500">{rangeLabel}</span>
        </div>
        {children}
      </main>
    </>
  );
}
