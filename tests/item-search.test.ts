/**
 * The medicine box's search (D-157): what is typed narrows the list, and the
 * best match is first, so Enter picks what the person meant.
 */
import { describe, it, expect } from "vitest";
import { searchItems } from "@/lib/item-search";

const items = [
  { brandName: "Paracetamol 500", genericName: "Paracetamol" },
  { brandName: "Amoxil 500", genericName: "Amoxicillin" },
  { brandName: "Cetamol", genericName: "Paracetamol" },
  { brandName: "Moxikind CV", genericName: "Amoxicillin + Clavulanic acid" },
  { brandName: "amoxycillin syrup", genericName: "Amoxicillin" },
  { brandName: "Zinc DT", genericName: "Zinc sulphate" },
];
const names = (q: string) => searchItems(items, q).map((i) => i.brandName);

describe("searching medicines", () => {
  it("lists everything alphabetically when nothing is typed", () => {
    expect(names("")).toEqual([
      "Amoxil 500",
      "amoxycillin syrup",
      "Cetamol",
      "Moxikind CV",
      "Paracetamol 500",
      "Zinc DT",
    ]);
    expect(names("   ")).toHaveLength(items.length);
  });

  it("puts a brand that starts with the text before one that contains it", () => {
    expect(names("amox")).toEqual([
      "Amoxil 500",
      "amoxycillin syrup",
      // generic starts with "amox"
      "Moxikind CV",
    ]);
  });

  it("finds a brand by its generic name, after the brands that match", () => {
    expect(names("paracetamol")).toEqual(["Paracetamol 500", "Cetamol"]);
  });

  it("ranks an exact name first", () => {
    expect(names("cetamol")[0]).toBe("Cetamol");
  });

  it("matches a word inside the name", () => {
    expect(names("cv")).toEqual(["Moxikind CV"]);
    expect(names("syr")).toEqual(["amoxycillin syrup"]);
  });

  it("takes words in any order", () => {
    expect(names("500 amox")).toEqual(["Amoxil 500"]);
    expect(names("zinc   dt")).toEqual(["Zinc DT"]);
  });

  it("ignores case, and returns nothing for no match", () => {
    expect(names("ZINC")).toEqual(["Zinc DT"]);
    expect(names("ibuprofen")).toEqual([]);
  });

  it("does not reorder the list it was given", () => {
    const copy = [...items];
    searchItems(items, "");
    expect(items).toEqual(copy);
  });
});
