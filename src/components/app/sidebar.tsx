"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Nav } from "@/components/app/nav";
import { Wordmark, AppMark } from "@/components/ui/wordmark";
import { PinSwitch, type SwitchableUser } from "@/components/app/pin-switch";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/repos/users";

const STORAGE_KEY = "clinicnp:nav-collapsed";

export function Sidebar({
  user,
  switchable,
  appName,
}: {
  user: { name: string; role: Role };
  switchable: SwitchableUser[];
  appName: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Load the saved preference after mount (avoids an SSR/client mismatch).
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sage-900 py-4 text-cream-50 transition-[width] duration-200",
        collapsed ? "w-[68px] px-2" : "w-[232px] px-3",
      )}
    >
      <div
        className={cn(
          "flex items-center pb-4",
          collapsed ? "flex-col gap-3 px-0" : "justify-between px-2 pt-1",
        )}
      >
        {collapsed ? (
          <AppMark name={appName} />
        ) : (
          <Wordmark name={appName} tone="light" className="pl-1" />
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="rounded-[8px] p-1.5 text-cream-50/60 hover:bg-sage-700/40 hover:text-cream-50"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <Nav role={user.role} collapsed={collapsed} />

      <div className="mt-auto flex flex-col gap-1 border-t border-sage-700/50 pt-3">
        {!collapsed && (
          <div className="px-2 pb-1">
            <div className="text-[14px] font-medium">{user.name}</div>
            <div className="text-[12px] text-cream-50/60">
              {user.role === "admin" ? strings.roleAdmin : strings.roleStaff}
            </div>
          </div>
        )}
        {switchable.length > 0 && !collapsed && <PinSwitch users={switchable} />}
        <button
          onClick={() => signOut({ redirectTo: "/login" })}
          title={collapsed ? strings.logout : undefined}
          className={cn(
            "flex items-center gap-2 rounded-[8px] py-1.5 text-[13px] text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50",
            collapsed ? "justify-center px-2" : "px-2",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && strings.logout}
        </button>
      </div>
    </aside>
  );
}
