/**
 * item-search.ts — finding a medicine by what somebody types.
 *
 * Used by the medicine box on Opening stock and Purchases, where the list is a
 * thousand names long and a dropdown is no way to find one (D-157). Ranked the
 * way the counter's search ranks: a name that starts with what was typed beats
 * one that merely contains it, and the brand beats the generic. Words may come
 * in any order, so "500 amox" still finds "Amoxil 500".
 */

export interface SearchableItem {
  brandName: string;
  genericName: string;
}

function words(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

/** How well one item matches, lower is better, or -1 for not at all. */
function score(item: SearchableItem, q: string, qWords: string[]): number {
  const brand = item.brandName.toLowerCase();
  const generic = item.genericName.toLowerCase();
  if (brand === q) return 0;
  if (brand.startsWith(q)) return 1;
  if (words(brand).some((w) => w.startsWith(q))) return 2;
  if (generic.startsWith(q) || words(generic).some((w) => w.startsWith(q))) return 3;
  if (brand.includes(q)) return 4;
  if (generic.includes(q)) return 5;
  const both = `${brand} ${generic}`;
  if (qWords.length > 1 && qWords.every((w) => both.includes(w))) return 6;
  return -1;
}

/**
 * The items matching `query`, best first; ties in alphabetical order. An empty
 * query is every item, alphabetically, so the box can be browsed like a list.
 */
export function searchItems<T extends SearchableItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = (a: T, b: T) =>
    a.brandName.localeCompare(b.brandName, undefined, { sensitivity: "base" });
  if (!q) return [...items].sort(byName);

  const qWords = words(q);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const s = score(item, q, qWords);
    if (s >= 0) scored.push({ item, score: s });
  }
  return scored
    .sort((a, b) => a.score - b.score || byName(a.item, b.item))
    .map((r) => r.item);
}
