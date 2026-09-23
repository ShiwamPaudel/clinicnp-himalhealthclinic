/**
 * Reading a supplier's invoice off a photo (C-020).
 *
 * Every fixture below is real: it is the text PaddleOCR actually produced from
 * the photos of Himal's own bills, misreadings and all ("TA8" for TAB, "S0LAY"
 * for SOLAY, "4:896.80" for 1,896.80). That is deliberate — a parser for
 * invoices is only worth what it does with the mess, and inventing clean input
 * for it to succeed on would prove nothing.
 *
 * The supplier's own header lines are left out; only the item rows and the
 * closing figures are needed here.
 */
import { describe, it, expect } from "vitest";
import {
  parseInvoiceText,
  moneyToPaisa,
  expiryFromToken,
} from "@/lib/invoice-read/parse";
import { canonical, matchItem, scoreAgainst } from "@/lib/invoice-read/match";
import { buildDraft, expiryMonthToBs, type DraftItem } from "@/lib/invoice-read/draft";

const REMEDIES = `
INVOICE 14:23:17PM
Invoice No.: BASRO002535
Transaction Date: 2083/06/07
S.N. HS CODE: ITEM DESCRIPTION: PACK: BATCH: EXP.DATE QTY: Cc/RATE: AMOUNT: M.R.P.
2028/02 w- O
1. FRUSAL TA8 073093 10 77.62 776.20 90.00
2. HYTIDE 25 TA8 095063 2028/01 10 41.42 414.20 48.00
CUSTOMER COPY TOTAL : 1,190.40
LES DISCOUNT : 63.66
RDUNDING : 0.26
NET TOTAL : 1,127.00
Inwords Rs.: One Thousand One Hundred Twenty-seven Only.
`;

const KB = `
TnvoicE No.
FASR0008599
Trar:acti0n Date 2083/06/06
S.N、 RS ODDE: ITEN DESCRIPTTON: PACK: BATCH: EXP.DATE QTY: CC/RATE: AMOUNT: M.R.P
1. S0LAY TAB 1X10 206031 2028/03 4 323.27 1.293.08 375.00
2. ONID0M TAB 1X10 OM2616 2028/05 20 142.24 2.844.80 165.00
- do - 1X10 OK2616 2028/05 4 FREE 0.002 0.00 165.00
5 ACNETRATE 10 1X10 ANC2703 2027/12 10 189.68 4:896.80 220.00
8. AMCA8 5MG 1X10 AC1 2902 2028/04 15 43.10 646.50 50.00
CUSTOMER COPY TOTAL 9.612.18
LESS DISCOUNT 480.61
ROUNDING 0.43
NET TOTAL 9.132.00
`;

const KB_SECOND = `
S.N. NS CODE:iTEN DESCRIPTION: PACK: BATCH: EXR.DATE QTY: CC/RATE: AMOUNT: M.R.P.
1.3004 MEDOMOL TAB 1X10 26088 2029/03 28 8.63 241.64 6.25
- do- 1X10 26088 2029/03 20 8.63 172.60 6.25
2. RA8 20 1X15 C826001 2027/07 20 181-04 3,620.80 210.00
- do - 1X15 C626001 2027/07 LFREE 0.005 0.00 210.00
CUSTOMER COPY TOTAL ! 18,796.48
LESS DISCOUNT : 788.17
ROUNDING : -0.31
HET TOTAL : 18,008.00
`;

const NAVYA = `
TAXINVOICE
oL250ML12MP UREEXTRAVIRGINCNO:BABY 5002 PCS 487:4a 10 0.00
TadeDicoun5.0% 3
TaableAmoumt 43
NetTotal 2754.26
`;

describe("what the numbers on a bill come back as", () => {
  it("reads two decimals however the separators were printed", () => {
    expect(moneyToPaisa("1,190.40")).toBe(119040);
    expect(moneyToPaisa("1.293.08")).toBe(129308); // OCR gave the comma as a dot
    expect(moneyToPaisa("181-04")).toBe(18104); // and the decimal point as a dash
    expect(moneyToPaisa("77.62")).toBe(7762);
    expect(moneyToPaisa("-0.31")).toBe(-31);
  });

  it("reads an expiry however the supplier printed it", () => {
    expect(expiryFromToken("2028/02")).toBe("2028-02"); // the dot-matrix bills
    expect(expiryFromToken("06/28")).toBe("2028-06"); // a two-digit year
    expect(expiryFromToken("12/2026")).toBe("2026-12"); // year last
    expect(expiryFromToken("202B/06")).toBe("2028-06"); // B is an 8
  });

  it("refuses anything that is not an expiry", () => {
    expect(expiryFromToken("2028/13")).toBe(""); // no thirteenth month
    expect(expiryFromToken("207/102")).toBe(""); // a mangled column, not a date
    expect(expiryFromToken("073093")).toBe(""); // a batch number
    expect(expiryFromToken("15/99")).toBe(""); // neither half is a month
    // The one that matters most: a rate must never read as a date.
    expect(expiryFromToken("8.55")).toBe("");
    expect(expiryFromToken("12.26")).toBe("");
  });
});

describe("a printed invoice, as OCR gave it back", () => {
  it("reads Remedies: both rows, the invoice number and every closing figure", () => {
    const r = parseInvoiceText(REMEDIES);
    expect(r.invoiceNo).toBe("BASR0002535"); // the O after BASR is a zero
    expect(r.dateBs).toBe("2083-06-07");
    expect(r.totalPaisa).toBe(119040);
    expect(r.billDiscountPaisa).toBe(6366);
    expect(r.roundingPaisa).toBe(26);
    expect(r.netTotalPaisa).toBe(112700);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({
      printedName: "FRUSAL TA8",
      batchNo: "073093",
      qty: 10,
      unitCostPaisa: 7762,
      // This bill's expiry column drifted onto a line of its own, so the row
      // keeps its figures and leaves the date for the person.
      expiryAdMonth: "",
    });
    expect(r.lines[1]).toMatchObject({
      batchNo: "095063",
      expiryAdMonth: "2028-01",
      qty: 10,
      unitCostPaisa: 4142,
    });
  });

  it("puts a batch back together when it was printed with a space in it", () => {
    const r = parseInvoiceText(KB);
    const amcab = r.lines.find((l) => l.printedName.startsWith("AMCA"))!;
    expect(amcab.printedName).toBe("AMCA8 5MG");
    expect(amcab.batchNo).toBe("AC12902");
    expect(amcab.qty).toBe(15);
  });

  it("counts a free continuation row as bonus stock on the row above it", () => {
    const r = parseInvoiceText(KB);
    const onidom = r.lines.find((l) => l.printedName.startsWith("ONID"))!;
    expect(onidom.qty).toBe(20);
    expect(onidom.freeQty).toBe(4);
    // and it does not become a line of its own
    expect(r.lines.filter((l) => l.unitCostPaisa === 0)).toHaveLength(0);
  });

  it("carries the name down a continuation row that is a second batch", () => {
    const r = parseInvoiceText(KB_SECOND);
    const medomol = r.lines.filter((l) => l.printedName.startsWith("MEDOMOL"));
    expect(medomol).toHaveLength(2);
    expect(medomol[0]!.qty).toBe(28);
    expect(medomol[1]!.qty).toBe(20);
    expect(medomol[1]!.printedName).toBe("MEDOMOL TAB");
  });

  it("flags a row whose quantity times rate is not the amount printed", () => {
    const r = parseInvoiceText(KB);
    // 10 x 189.68 is 1,896.80; OCR read the amount as 4:896.80.
    const acnetrate = r.lines.find((l) => l.printedName.startsWith("ACNETRATE"))!;
    expect(acnetrate.amountDisagrees).toBe(true);
    // while a row that adds up is not flagged
    expect(r.lines.find((l) => l.printedName.startsWith("S0LAY"))!.amountDisagrees).toBe(false);
  });

  it("takes a rounding line that goes downwards, and a mangled NET TOTAL", () => {
    const r = parseInvoiceText(KB_SECOND);
    expect(r.roundingPaisa).toBe(-31);
    expect(r.netTotalPaisa).toBe(1800800); // printed "HET TOTAL : 18,008.00"
    expect(r.billDiscountPaisa).toBe(78817);
  });

  it("closes a bill on whichever wording the supplier prints", () => {
    const amount = parseInvoiceText("Gross Amount 10056.05\nDiscount (2%) 201.12\nNet Amount 9854.93");
    expect(amount.totalPaisa).toBe(1005605);
    expect(amount.billDiscountPaisa).toBe(20112);
    expect(amount.netTotalPaisa).toBe(985493);

    const grand = parseInvoiceText("Grand Total 1,234.50");
    expect(grand.netTotalPaisa).toBe(123450);
  });

  it("keeps nothing it cannot identify off a bill it could not read", () => {
    // The laser bill has no batch or expiry columns at all and its rows came
    // back as noise. Better an empty form than rows of invented figures.
    const r = parseInvoiceText(NAVYA);
    expect(r.lines).toHaveLength(0);
    expect(r.hasVat).toBe(true);
    expect(r.netTotalPaisa).toBe(275426);
  });
});

describe("finding the medicine in the catalogue", () => {
  const items: DraftItem[] = [
    { id: "a", brandName: "SOLAY TAB", genericName: "Sodium Valproate", units: [{ level: 0 }, { level: 1 }] },
    { id: "b", brandName: "RAB 20", genericName: "Rabeprazole", units: [{ level: 0 }] },
    { id: "c", brandName: "RAB 40", genericName: "Rabeprazole", units: [{ level: 0 }] },
    { id: "d", brandName: "Amcab 5mg", genericName: "Amlodipine", units: [{ level: 0 }, { level: 2 }] },
  ];

  it("folds the letters OCR confuses with digits onto one alphabet", () => {
    expect(canonical("S0LAY")).toBe(canonical("SOLAY"));
    expect(canonical("AMCA8")).toBe(canonical("AMCAB"));
    expect(canonical("TA8")).toBe(canonical("TAB"));
  });

  it("matches a name OCR half-destroyed", () => {
    const m = matchItem("S0LAY TAB", items)!;
    expect(m.itemId).toBe("a");
    expect(m.confident).toBe(true);
  });

  it("matches when the supplier printed more than the catalogue holds", () => {
    const m = matchItem("AMCA8 5MG 1X10", items)!;
    expect(m.itemId).toBe("d");
    expect(m.confident).toBe(true);
  });

  it("refuses to choose between two strengths of the same medicine", () => {
    // "RAB" alone is both RAB 20 and RAB 40. Filling one in would put the
    // wrong strength into the stock, which is the mistake this screen exists
    // to prevent — so it fills in nothing and lets the person look.
    const m = matchItem("RAB", items);
    expect(m?.confident ?? false).toBe(false);
  });

  it("gives back nothing for a medicine that is not in the catalogue", () => {
    expect(matchItem("MIRASIN 50 XR", items)?.confident ?? false).toBe(false);
    expect(scoreAgainst("MIRASIN 50 XR", items[0]!)).toBeLessThan(0.45);
  });
});

describe("the draft that lands in the form", () => {
  const items: DraftItem[] = [
    { id: "a", brandName: "SOLAY TAB", genericName: "Sodium Valproate", units: [{ level: 0 }, { level: 1 }] },
  ];

  it("dates a pack to the end of the month it expires in", () => {
    // 2028/02 means it is good to the 29th, which is what makes a sales bill
    // print it back as 02/2028 (D-142).
    expect(expiryMonthToBs("2028-02")).toBe("2084-11-17");
    expect(expiryMonthToBs("2027-11")).toBe("2084-08-14");
    expect(expiryMonthToBs("")).toBe("");
  });

  it("fills the boxes the form uses, and leaves the rest empty", () => {
    const draft = buildDraft(parseInvoiceText(KB), items);
    expect(draft.invoiceNo).toBe("FASR0008599");
    expect(draft.dateBs).toBe("2083-06-06");
    expect(draft.billDiscountRupees).toBe("480.61");
    expect(draft.roundingRupees).toBe("0.43");
    expect(draft.netTotalPaisa).toBe(913200);

    const solay = draft.lines[0]!;
    expect(solay.itemId).toBe("a");
    // The purchase unit is the biggest one the item has.
    expect(solay.unitLevel).toBe(1);
    expect(solay.qty).toBe("4");
    expect(solay.costRupees).toBe("323.27");
    expect(solay.expiryDateBs).toBe("2084-12-18");
    expect(solay.printedName).toBe("S0LAY TAB");

    // Nothing matched the rest, so their boxes stay empty and carry the name
    // the supplier printed instead.
    const unmatched = draft.lines.filter((l) => !l.itemId);
    expect(unmatched.length).toBe(draft.lines.length - 1);
    expect(unmatched.every((l) => l.printedName.length > 0)).toBe(true);
    expect(draft.matched).toBe(1);
  });

  it("never fills in a supplier, a manufacture date or a line discount", () => {
    const draft = buildDraft(parseInvoiceText(REMEDIES), items);
    // The draft has no supplier field at all: picking the wrong one would put
    // the money on the wrong ledger, so it stays the person's to choose.
    expect("supplierId" in draft).toBe(false);
    expect(draft.lines.every((l) => l.freeQty === "0" || Number(l.freeQty) > 0)).toBe(true);
  });
});
