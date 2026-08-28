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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/repos/users";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/billing", label: "New bill", icon: Receipt },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/items", label: "Items", icon: Package, adminOnly: true },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart, adminOnly: true },
  { href: "/suppliers", label: "Suppliers", icon: Truck, adminOnly: true },
  { href: "/bills", label: "Bills", icon: ReceiptText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings/company", label: "Settings", icon: Settings, adminOnly: true },
];

export function Nav({ role, collapsed = false }: { role: Role; collapsed?: boolean }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.adminOnly || role === "admin");

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[8px] py-2 text-[14px] transition-colors",
              collapsed ? "justify-center px-2" : "px-3",
              active
                ? "bg-sage-700 text-cream-50"
                : "text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}
