import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck, FlaskConical, HandCoins } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { listSuppliers, supplierBalance } from "@/lib/repos/suppliers";
import { partnerSummary } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

/**
 * Payables — everything the clinic owes, in one place: each supplier's
 * balance and each outside laboratory's.
 *
 * It reads the same ledgers the supplier page and the laboratory statement
 * keep, so the figures here are theirs and cannot drift from them. Payments
 * are still recorded where they always were; each row links there. Not behind
 * one module: suppliers belong to the pharmacy and laboratories to the clinic,
 * and each half shows only when its module is on.
 */

interface Owed {
  id: string;
  name: string;
  owedPaisa: number;
  href: string;
}

export default async function PayablesPage() {
  await requireAdmin();
  const modules = await getModules();
  if (!modules.pharmacy && !modules.clinic) notFound();

  const suppliers: Owed[] = modules.pharmacy
    ? await Promise.all(
        (await listSuppliers(true)).map(async (s) => ({
          id: s.id,
          name: s.name,
          owedPaisa: await supplierBalance(s.id),
          href: `/suppliers/${s.id}`,
        })),
      )
    : [];

  // "Owed now" in the summary is everything ever sent less everything ever
  // paid, whatever range is passed; the range only feeds its other columns.
  const labs: Owed[] = modules.clinic
    ? (await partnerSummary(resolveRange({}))).map((p) => ({
        id: p.partnerId,
        name: p.name,
        owedPaisa: p.balancePaisa,
        href: `/reports/lab-partners?partner=${p.partnerId}`,
      }))
    : [];

  const open = (rows: Owed[]) =>
    rows.filter((r) => r.owedPaisa !== 0).sort((a, b) => b.owedPaisa - a.owedPaisa);
  const owing = (rows: Owed[]) =>
    rows.reduce((s, r) => s + Math.max(0, r.owedPaisa), 0);

  const supplierRows = open(suppliers);
  const labRows = open(labs);
  const supplierTotal = owing(suppliers);
  const labTotal = owing(labs);

  return (
    <PageShell title="Payables">
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Tile label="Owed in all" value={supplierTotal + labTotal} strong />
        {modules.pharmacy && <Tile label="To suppliers" value={supplierTotal} />}
        {modules.clinic && <Tile label="To laboratories" value={labTotal} />}
      </div>

      {modules.pharmacy && (
        <Section
          title="Suppliers"
          rows={supplierRows}
          action="Ledger & payment"
          empty="Nothing is owed to any supplier."
          icon={Truck}
        />
      )}
      {modules.clinic && (
        <Section
          title="Laboratories"
          rows={labRows}
          action="Statement & payment"
          empty="Nothing is owed to any outside laboratory."
          icon={FlaskConical}
        />
      )}

      <p className="mt-4 text-[12px] text-sage-500">
        Anyone with nothing owing is left off. A minus figure means more has
        been paid than was owed. A payment to a supplier can also be recorded
        when the purchase is entered.
      </p>
    </PageShell>
  );
}

function Section({
  title,
  rows,
  action,
  empty,
  icon,
}: {
  title: string;
  rows: Owed[];
  action: string;
  empty: string;
  icon: typeof HandCoins;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[15px] font-semibold text-sage-900">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState icon={icon} message={empty} />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH className="text-right">Owed</TH>
                <TH> </TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-sage-900">{r.name}</TD>
                  <TD
                    className={cn(
                      "text-right tnum font-medium",
                      r.owedPaisa > 0 ? "text-danger-600" : "text-sage-600",
                    )}
                  >
                    {formatPaisa(r.owedPaisa)}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={r.href}
                      className="text-[13px] font-medium text-sage-700 hover:underline"
                    >
                      {action}
                    </Link>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 tnum font-bold text-sage-900",
          strong ? "text-[26px]" : "text-[20px]",
        )}
      >
        {formatPaisa(value)}
      </div>
    </div>
  );
}
