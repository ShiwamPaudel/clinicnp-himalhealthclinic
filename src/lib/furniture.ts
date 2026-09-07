/**
 * furniture.ts — what a shop keeps things on.
 *
 * Client-safe, because the settings screen picks a kind and the counter draws
 * one, and neither can import a server-only repo.
 *
 * A rack, a shelf and a desk are all "a grid of places" as far as the software
 * is concerned. The distinction is entirely for the person reading the map: a
 * plan that says "Rack 3" when they are looking at the front desk is a plan
 * they stop trusting. There is no behaviour attached to the kind, and there
 * should not be — the moment a desk needs its own rules it is a different
 * feature, not a different label.
 */

export const FURNITURE_KINDS = ["rack", "shelf", "desk"] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export const DEFAULT_FURNITURE_KIND: FurnitureKind = "rack";

/** Singular, for a label beside one piece. */
export const FURNITURE_LABEL: Record<FurnitureKind, string> = {
  rack: "Rack",
  shelf: "Shelf",
  desk: "Desk",
};

/** What the add button suggests naming the next one. */
export const FURNITURE_DEFAULT_NAME: Record<FurnitureKind, string> = {
  rack: "Rack",
  shelf: "Shelf",
  desk: "Desk",
};

/**
 * Anything unrecognised reads as a rack rather than throwing. A row written by
 * a newer version of the app should draw as *something* on an older one.
 */
export function asFurnitureKind(v: unknown): FurnitureKind {
  return FURNITURE_KINDS.includes(v as FurnitureKind)
    ? (v as FurnitureKind)
    : DEFAULT_FURNITURE_KIND;
}
