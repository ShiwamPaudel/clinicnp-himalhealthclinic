import Link from "next/link";
import {
  CalendarCheck,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Activity,
  CalendarClock,
  Wallet,
  Percent,
  Users,
  CreditCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import { PageShell } from "@/components/app/page-shell";

interface ReportCard {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  vatOnly?: boolean;
}

const REPORTS: ReportCard[] = [
  { href: "/reports/day-close", label: "Day-close / cash summary", desc: "Bills, sales, returns, expected cash", icon: CalendarCheck },
  { href: "/reports/sales-register", label: "Sales register", desc: "Every invoice in a date range", icon: ReceiptText, adminOnly: true },
  { href: "/reports/purchase-register", label: "Purchase register", desc: "Every purchase entry", icon: ShoppingCart, adminOnly: true },
  { href: "/reports/profit", label: "Profit margin", desc: "Revenue, cost, margin by item", icon: TrendingUp, adminOnly: true },
  { href: "/reports/moving", label: "Fast / slow moving", desc: "Best sellers and dead stock", icon: Activity, adminOnly: true },
  { href: "/reports/expiry", label: "Expiry report", desc: "Money on the shelf about to die", icon: CalendarClock, adminOnly: true },
  { href: "/reports/valuation", label: "Stock valuation", desc: "Cost and salable value", icon: Wallet, adminOnly: true },
  { href: "/reports/vat", label: "VAT report", desc: "Sales and purchase VAT summary", icon: Percent, adminOnly: true, vatOnly: true },
  { href: "/suppliers", label: "Party ledgers", desc: "Per-supplier statements", icon: Users, adminOnly: true },
  { href: "/bills/credit", label: "Credit aging", desc: "Outstanding credit bills", icon: CreditCard },
];

export default async function ReportsHubPage() {
  const user = await requireUser();
  const company = await getCompany();
  const isAdmin = user.role === "admin";

  const visible = REPORTS.filter(
    (r) => (!r.adminOnly || isAdmin) && (!r.vatOnly || company.vatRegistered),
  );

  return (
    <PageShell title="Reports">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="flex items-start gap-3 rounded-[10px] border border-line bg-cream-50 p-4 hover:bg-cream-200"
            >
              <div className="rounded-[8px] bg-sage-75 p-2">
                <Icon className="h-5 w-5 text-sage-700" />
              </div>
              <div>
                <div className="text-[15px] font-medium text-sage-900">{r.label}</div>
                <div className="text-[13px] text-sage-500">{r.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
