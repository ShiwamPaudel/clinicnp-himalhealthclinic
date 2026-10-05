"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Package,
  ShoppingCart,
  Truck,
  ReceiptText,
  BarChart3,
  Settings,
  Receipt,
  CalendarClock,
  CalendarCheck,
  Users,
  Stethoscope,
  FlaskConical,
  HandCoins,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/repos/users";
import type { ModuleFlags } from "@/lib/repos/company";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/**
 * Nav is grouped when both modules are on and flat when only one is, so a
 * pharmacy-only install looks exactly like it did in v1 (Design.md §3).
 * Group membership is presentation only — the real boundary is requireModule
 * on the server.
 */
interface NavGroup {
  /** null = ungrouped, always shown. */
  module: "clinic" | "pharmacy" | null;
  label?: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    module: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/billing", label: "New bill", icon: Receipt },
    ],
  },
  {
    module: "clinic",
    label: "Clinic",
    items: [
      { href: "/visits/today", label: "Today", icon: CalendarClock },
      { href: "/patients", label: "Patients", icon: Users },
      { href: "/visits", label: "Visits", icon: Stethoscope },
      { href: "/doctors", label: "Doctors", icon: CalendarCheck },
      { href: "/lab", label: "Laboratory", icon: FlaskConical },
    ],
  },
  {
    module: "pharmacy",
    label: "Pharmacy",
    items: [
      { href: "/stock", label: "Stock", icon: Boxes },
      { href: "/items", label: "Items", icon: Package, adminOnly: true },
      { href: "/purchases", label: "Purchases", icon: ShoppingCart, adminOnly: true },
      { href: "/suppliers", label: "Suppliers", icon: Truck, adminOnly: true },
    ],
  },
  {
    module: null,
    items: [
      { href: "/bills", label: "Bills", icon: ReceiptText },
      // Medicine and services both go on dues, so it sits with Bills rather
      // than inside either module's group.
      { href: "/dues", label: "Dues", icon: HandCoins },
      // What the clinic owes: suppliers and outside laboratories together.
      { href: "/payables", label: "Payables", icon: Banknote, adminOnly: true },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/settings/company", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function Nav({
  role,
  modules,
  collapsed = false,
}: {
  role: Role;
  modules: ModuleFlags;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  const visible = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.adminOnly || role === "admin") &&
        (g.module === null || modules[g.module]),
    ),
  })).filter((g) => g.items.length > 0);

  // Labels only earn their place when more than one module's group is showing.
  const labelledGroups = visible.filter((g) => g.module !== null).length;
  const showLabels = labelledGroups > 1;

  // Opened out, every group after the first lays its items in two columns, so
  // the whole menu fits on a laptop screen without scrolling. Dashboard and
  // New bill keep a full row each: they are the two places people go most.
  // Folded to icons, everything is one column as before.
  const twoColumns = (gi: number) => !collapsed && gi > 0;

  return (
    <nav className="flex flex-col gap-1">
      {visible.map((group, gi) => (
        <div
          key={group.module ?? `plain-${gi}`}
          className={cn(
            "flex flex-col gap-1",
            // The last plain group (Bills, Dues…) is set off by a rule.
            !collapsed &&
              gi > 0 &&
              group.module === null &&
              "mt-2 border-t border-cream-50/15 pt-3",
          )}
        >
          {group.module !== null &&
            showLabels &&
            (collapsed ? (
              <div className="my-1.5 border-t border-cream-50/15" />
            ) : (
              <div
                className={cn(
                  "mt-3 px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
                  group.module === "clinic"
                    ? "text-clinic-150"
                    : "text-sage-300",
                )}
              >
                {group.label}
              </div>
            ))}

          <div
            className={
              twoColumns(gi) ? "grid grid-cols-2 gap-x-1 gap-y-1" : "flex flex-col gap-1"
            }
          >
          {group.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex min-w-0 items-center rounded-[8px] py-2 text-[14px] transition-colors",
                  collapsed ? "justify-center px-2" : twoColumns(gi) ? "gap-2 px-2.5" : "gap-3 px-3",
                  active
                    ? "bg-sage-700 text-cream-50"
                    : "text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
          </div>
        </div>
      ))}
    </nav>
  );
}
