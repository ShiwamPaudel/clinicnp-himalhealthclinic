"use client";

import { Dialog } from "@/components/ui/dialog";

const SHORTCUTS: [string, string][] = [
  ["F2", "Start a new bill"],
  ["Type + Enter", "Search and add a medicine or service"],
  ["F3", "Narrow the search to medicines or services"],
  ["P", "Attach a patient to this bill"],
  ["↑ / ↓", "Move through search results"],
  ["U", "Switch unit (Box / Strip / Tablet)"],
  ["Tab", "Move quantity → rate"],
  ["B", "Choose a different batch"],
  ["Del", "Remove the selected line"],
  ["Enter (empty search)", "Go to payment"],
  ["F7", "Hold this bill"],
  ["F8", "Resume a held bill"],
  ["F9", "Save & print"],
  ["?", "Show this help"],
];

export function ShortcutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="flex flex-col gap-1.5">
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-[14px] text-sage-700">{desc}</span>
            <kbd className="rounded-[6px] border border-line bg-cream-100 px-2 py-0.5 text-[12px] font-semibold text-sage-950">
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
