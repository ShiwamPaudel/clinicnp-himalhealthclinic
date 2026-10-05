"use client";

/**
 * global-shortcuts.tsx — the keys that work on every back-office screen.
 *
 * Only F2 for now: it opens the counter, the same as "New bill" in the side
 * menu. The counter screen has its own keys, where F2 starts a fresh bill.
 * Somebody who can only read the books has no counter, so for them F2 is
 * left to the browser.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function GlobalShortcuts({ canBill }: { canBill: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!canBill) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F2" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (e.repeat) return;
      router.push("/billing");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canBill, router]);

  return null;
}
