"use client";

import { Dialog } from "@/components/ui/dialog";

/**
 * Every key listed here is wired up on the counter. When one changes, this
 * list changes with it: a shortcut sheet that promises a key that does
 * nothing is how people learn to stop reading it.
 */
const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Anywhere on the counter",
    keys: [
      ["F2", "New bill (the one on screen is held, not lost)"],
      ["F3", "Narrow the search to medicines or services"],
      ["F4", "Attach a patient to this bill"],
      ["F7", "Hold this bill"],
      ["F8", "Held bills (then 1 to 9 to resume, Esc to close)"],
      ["F9", "Save & print"],
      ["?", "Show this help"],
    ],
  },
  {
    title: "In the search box",
    keys: [
      ["Type + Enter", "Add the highlighted medicine or service"],
      ["↑ / ↓", "Move through the results"],
      ["Esc", "Clear what was typed"],
      ["Enter (empty)", "Go to payment"],
    ],
  },
  {
    title: "In a quantity box",
    keys: [
      ["Type a number", "Replaces the quantity"],
      ["U", "Switch unit (Box / Strip / Tablet)"],
      ["B", "Choose a different batch"],
      ["Del", "Remove this line"],
      ["↑ / ↓", "Previous or next line"],
      ["Tab", "On to the rate, then the discount"],
      ["P", "Attach a patient"],
      ["Enter / Esc", "Back to the search for the next item"],
    ],
  },
  {
    title: "In payment",
    keys: [["Enter", "Save & print"]],
  },
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
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
              {group.title}
            </h3>
            {group.keys.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-[14px] text-sage-700">{desc}</span>
                <kbd className="shrink-0 rounded-[6px] border border-line bg-cream-100 px-2 py-0.5 text-[12px] font-semibold text-sage-950">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        ))}
        <p className="text-[12px] text-sage-500">
          F2 also opens a new bill from any other screen.
        </p>
      </div>
    </Dialog>
  );
}
