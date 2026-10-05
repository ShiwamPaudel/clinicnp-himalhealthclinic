/**
 * parse.ts — turn the text OCR read off a supplier's invoice photo into
 * something the purchase form can be filled with.
 *
 * Nothing here touches the database, the network or the DOM: text in, a draft
 * purchase out. That is deliberate — every rule below was written against the
 * actual OCR output of Himal's own suppliers' bills, and the only way to keep
 * it honest as the suppliers change their stationery is to be able to pin a
 * real line of text in a test.
 *
 * What the bills look like. Three of the four distributors print from the same
 * dot-matrix package, with this header:
 *
 *   S.N. HS CODE: ITEM DESCRIPTION: PACK: BATCH: EXP.DATE QTY: CC/RATE: AMOUNT: M.R.P.
 *   1. SOLAY TAB 1X10 206031 2028/03 4 323.27 1,293.08 375.00
 *
 * so the expiry is the hinge: the description, pack and batch sit to its left,
 * and the quantity, rate, amount and MRP to its right. Free goods come as a
 * continuation row that repeats "- do -" instead of a name.
 *
 * What we never do is trust it. Every row's arithmetic is checked (qty x rate
 * against the printed amount) and the bill's own TOTAL / LESS DISCOUNT /
 * ROUNDING / NET TOTAL are read separately, so the form can tell the person
 * where the reading and the paper disagree. The person tallies and corrects;
 * nothing is saved until they press Save.
 */

/** One row of the supplier's bill, as far as it could be read. */
export interface ReadLine {
  /** The name exactly as printed, kept so the person can see what the paper said. */
  printedName: string;
  /** Pack text as printed ("1X10", "10's", "1 vial") — used to guess the unit. */
  pack: string;
  batchNo: string;
  /** Expiry as "YYYY-MM" in AD, or "" when the bill has no expiry column. */
  expiryAdMonth: string;
  qty: number;
  freeQty: number;
  unitCostPaisa: number;
  /** The amount as printed. */
  amountPaisa: number;
  /**
   * True when qty x rate did not agree with the printed amount. OCR misreads a
   * digit often enough (4:896.80 for 1,896.80) that this is the single most
   * useful signal on the page: the row is worth a second look.
   */
  amountDisagrees: boolean;
}

export interface ReadInvoice {
  invoiceNo: string;
  /** The supplier's own transaction date, in BS, as "YYYY-MM-DD" or "". */
  dateBs: string;
  lines: ReadLine[];
  /** The bill's own figures, or null where they could not be read. */
  totalPaisa: number | null;
  billDiscountPaisa: number | null;
  roundingPaisa: number | null;
  netTotalPaisa: number | null;
  hasVat: boolean;
}

/* ------------------------------------------------------------------ tokens */

/**
 * OCR confuses a handful of letters with digits, and does it consistently:
 * O for 0, B and S for 8 and 5, I and l for 1, Z for 2. We only ever apply
 * this inside a token that is already shaped like a number (an expiry, a
 * batch that is all digits elsewhere), never to a medicine's name.
 */
function digitsOnly(s: string): string {
  return s.replace(/[OoDQ]/g, "0").replace(/[Il|]/g, "1").replace(/[Zz]/g, "2").replace(/[Ss]/g, "5").replace(/[Bb]/g, "8");
}

/**
 * Paisa from a printed amount. The separators are unreliable: the thousands
 * mark comes back as "." as often as ",", and a decimal point is sometimes a
 * dash or a colon (181-04, 4:896.80). What is reliable is that these columns
 * always print two decimal places, so the last two digits are the paisa.
 */
export function moneyToPaisa(token: string): number | null {
  const neg = /^[-~]/.test(token.trim());
  const cleaned = token.replace(/[^\d.,:\-]/g, "").replace(/^-/, "");
  if (!/\d/.test(cleaned)) return null;
  const groups = cleaned.split(/[.,:\-]+/).filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const last = groups[groups.length - 1]!;
  let paisa: number;
  if (groups.length > 1 && last.length === 2) {
    paisa = Number(groups.slice(0, -1).join("")) * 100 + Number(last);
  } else if (groups.length === 1) {
    // A bare number: whole rupees.
    paisa = Number(last) * 100;
  } else {
    // Separators but no two-digit tail — read it as whole rupees.
    paisa = Number(groups.join("")) * 100;
  }
  return Number.isFinite(paisa) ? (neg ? -paisa : paisa) : null;
}

/**
 * True for a token that prints like money: two decimal places, with or
 * without a thousands mark ("9,612.18", "1.293.08", "2754.26", "77.62").
 */
function looksLikeMoney(token: string): boolean {
  const t = token.replace(/[^\d.,:\-%~]/g, "");
  return (
    /^[-~]?\d{1,3}(?:[.,:\-]\d{3})+[.,:\-]\d{2}%?$/.test(t) ||
    /^[-~]?\d+[.,:\-]\d{2}%?$/.test(t)
  );
}

/** True for a bare whole number, which on these bills means a quantity. */
function looksLikeCount(token: string): boolean {
  return /^\d{1,4}$/.test(token);
}

/* ------------------------------------------------------------------ expiry */

/**
 * A slash or a dash, never a dot: "8.55" is a rate, and letting a dot count
 * would turn half the money on a bill into expiry dates in the 2050s.
 */
const EXPIRY = /^([0-9OoBbSsZzIl]{1,4})[/-]([0-9OoBbSsZzIl]{1,4})$/;

function inRange(year: number): boolean {
  return year >= 2020 && year <= 2060;
}

/**
 * An expiry month, as "YYYY-MM". Suppliers print it every way there is —
 * "2028/02" on the dot-matrix bills, "06/28" and "12/2026" on others — so all
 * three are read, and which half is the year is decided by the numbers rather
 * than by the supplier.
 *
 * Anything that is not a plausible expiry comes back empty: the year has to be
 * one a medicine could carry, which is what stops a batch number, a phone
 * number or a mangled column being taken for a date.
 */
export function expiryFromToken(token: string): string {
  const m = EXPIRY.exec(token.trim());
  if (!m) return "";
  const a = digitsOnly(m[1]!);
  const b = digitsOnly(m[2]!);
  const na = Number(a);
  const nb = Number(b);
  // "2028/02"
  if (a.length === 4 && inRange(na) && nb >= 1 && nb <= 12) {
    return `${na}-${String(nb).padStart(2, "0")}`;
  }
  // "12/2026"
  if (b.length === 4 && inRange(nb) && na >= 1 && na <= 12) {
    return `${nb}-${String(na).padStart(2, "0")}`;
  }
  // "06/28" — a two-digit year, which on a medicine is always this century.
  if (b.length === 2 && na >= 1 && na <= 12 && inRange(2000 + nb)) {
    return `${2000 + nb}-${String(na).padStart(2, "0")}`;
  }
  return "";
}

/* -------------------------------------------------------------------- pack */

// The 1 of "1TUBE" comes back as an I or an l as often as a 1 (Sohan).
const PACK_WORDS = /^([1Il]?(PH|ANP|AMP|TUBE?|TU8|VIAL|VIXD|PCS|BOX|JAR|STRIP|BTL|KIT))$/i;

/** Words for what a medicine is, which some suppliers print twice over. */
const FORM_WORDS = /^(TAB|TABS|TA8|CAP|CAPS|SYP|SYR|SUSP|INJ|[O0]INT|CREAM|GEL|LOTION|DROPS?|SOL|SACHET)$/i;
/** A strength or size with its unit: 100ML, 15GM, 500MG. */
const SIZED = /^\d+(\.\d+)?(ML|GM|G|MG|MCG|IU)$/i;

/**
 * The pack, printed again at the end of a name. Sohan prints the pack column
 * hard against the description, so "CODOPAR TAB" with a pack of "10 TAB" comes
 * back as "CODOPAR TAB 10 TAB", and "CALIN LOTION 100ML" with a pack of "1" as
 * "CALIN LOTION 100ML 1". Trailing pack text is taken off; a number is only
 * taken off when it follows a form or a size, because after anything else it
 * is the strength ("ACNETRATE 10", "RAB 20") and must stay.
 */
function tidyName(name: string): string {
  const t = name.split(/\s+/).filter(Boolean);
  for (;;) {
    const last = t[t.length - 1];
    const prev = t[t.length - 2];
    if (!last || !prev) break;
    if (looksLikePack(last)) {
      t.pop();
    } else if (/^\d{1,3}$/.test(last) && (FORM_WORDS.test(prev) || SIZED.test(prev))) {
      t.pop();
    } else if (
      FORM_WORDS.test(last) &&
      t.slice(0, -1).some((w) => w.toUpperCase() === last.toUpperCase())
    ) {
      t.pop();
    } else {
      break;
    }
  }
  return t.join(" ");
}

function looksLikePack(token: string): boolean {
  if (/^\d{1,3}\s*[xX*]\s*\d{1,3}$/.test(token)) return true; // 1X10, 1X15
  // 10's, 15's — and 15'5, because OCR reads the trailing s as a 5 often. The
  // apostrophe is what makes the 5 allowed: without it "25" is a strength.
  if (/^\d{1,3}(['’][sS5]|[sS])$/.test(token)) return true;
  return PACK_WORDS.test(token);
}

/* -------------------------------------------------------------------- rows */

/**
 * The word FREE, however OCR spelled it: "EREE" and "FRFE" are the same dot-
 * matrix letters misread, and a free row read as a paid one takes the MRP for
 * its amount.
 */
function isFreeWord(token: string): boolean {
  return /^FREE/i.test(token) || /^[FE][RP][EF][EF]$/i.test(token);
}

/**
 * Pull apart what OCR ran together: a quantity stuck to FREE ("2.EREE",
 * "LFREE" for 1 FREE), and a stray mark in front of a quantity (".2").
 */
function separate(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const glued = /^([\dlI|]{1,3})[.,]?([A-Za-z]{4})$/.exec(t);
    if (glued && isFreeWord(glued[2]!)) {
      out.push(digitsOnly(glued[1]!), glued[2]!);
    } else if (/^[.,'`](\d{1,4})$/.test(t)) {
      out.push(t.slice(1));
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Where a "- do -" sits among a row's words, as [first, last] index. It is
 * usually at the start, but OCR can read a crooked row together with the name
 * of the row below it ("ANOMYCETIN- EYE OINT - do - TAB 26441494 ..."), which
 * puts the marker in the middle.
 */
function dittoSpan(tokens: string[]): [number, number] | null {
  const dash = (t: string | undefined) => !!t && /^[-–—]+$/.test(t);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!/^[-–—]*do[-–—]*$/i.test(t)) continue;
    const before = dash(tokens[i - 1]);
    const after = dash(tokens[i + 1]);
    if (!/[-–—]/.test(t) && !before && !after) continue;
    return [before ? i - 1 : i, after ? i + 1 : i];
  }
  return null;
}

/** A continuation row: the same medicine again, as free goods or a second batch. */
function isDitto(line: string): boolean {
  return /^[-–—\s]*do[-–—\s]*$/i.test(line.trim().split(/\s{2,}/)[0] ?? "") || /^\s*[-–—]\s*do\s*[-–—]/i.test(line);
}

interface RowParts {
  left: string[];
  right: string[];
  expiry: string;
}

/**
 * Split a row into what is left of the number columns and what is right of
 * them.
 *
 * The expiry is the hinge when it is there. It is not always: on the Remedies
 * bill the whole expiry column drifted onto a line of its own, leaving
 * "1. FRUSAL TA8 073093 10 77.62 776.20 90.00" with nothing to hinge on. So
 * the fallback is the quantity — the last bare number that still has two
 * printed amounts after it, which is exactly the QTY column and never a
 * strength in the medicine's name ("HYTIDE 25", "AMCAB 5MG").
 */
function splitRow(tokens: string[]): RowParts | null {
  for (let i = 0; i < tokens.length; i++) {
    const expiry = expiryFromToken(tokens[i]!);
    if (expiry) {
      return { left: tokens.slice(0, i), right: tokens.slice(i + 1), expiry };
    }
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!looksLikeCount(tokens[i]!)) continue;
    const after = tokens.slice(i + 1).filter((t) => looksLikeMoney(t) && !t.includes("%"));
    if (after.length >= 2) {
      return { left: tokens.slice(0, i), right: tokens.slice(i), expiry: "" };
    }
  }
  return null;
}

/**
 * Strip the serial number and the HS code from the front of a row. The bills
 * print "1." or "1" and then, on some lines only, a four-to-eight digit customs
 * code ("1.3004 MEDOMOL TAB"), which is not part of the medicine's name.
 */
function stripSerial(tokens: string[]): string[] {
  const out = [...tokens];
  if (out.length && /^\d{1,2}[.,:]?$/.test(out[0]!)) out.shift();
  else if (out.length && /^\d{1,2}[.,]\d{4,8}$/.test(out[0]!)) {
    // "1.3004" — serial and HS code run together.
    out.shift();
  }
  if (out.length && /^\d{4,8}$/.test(out[0]!) && out.length > 2) out.shift();
  return out;
}

/**
 * Name, pack and batch out of what sat left of the numbers.
 *
 * The pack column is the divider: whatever is printed before it is the
 * medicine, whatever comes after it is the batch. That matters because a batch
 * is not always one token — "AC1 2902" and "TC-26003" are both one batch
 * number with a space or a dash in the middle of it, and taking only the last
 * token would put "AC1" into the medicine's name.
 */
function readLeft(left: string[]): { name: string; pack: string; batchNo: string } {
  const t = stripSerial(left);
  if (t.length === 0) return { name: "", pack: "", batchNo: "" };

  let packAt = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (looksLikePack(t[i]!)) {
      packAt = i;
      break;
    }
  }
  if (packAt === -1) {
    // No pack column read: the batch is the last token, the name is the rest.
    return {
      name: tidyName(t.slice(0, -1).join(" ").replace(/[:;,]+$/, "").trim()),
      pack: "",
      batchNo: cleanBatch([t[t.length - 1]!]),
    };
  }
  let pack = t[packAt]!;
  let nameEnd = packAt;
  // "1 vial" and "1 TUBE" arrive as two tokens.
  if (packAt > 0 && /^\d$/.test(t[packAt - 1]!) && /^[A-Za-z]/.test(pack)) {
    pack = `${t[packAt - 1]} ${pack}`;
    nameEnd = packAt - 1;
  }
  return {
    name: tidyName(t.slice(0, nameEnd).join(" ").replace(/[:;,]+$/, "").trim()),
    pack,
    batchNo: cleanBatch(t.slice(packAt + 1)),
  };
}

/**
 * Join what the batch column held. Anything shaped like a half-read expiry
 * ("207/102") is dropped: it is the next column bleeding in, not the batch.
 */
function cleanBatch(tokens: string[]): string {
  return tokens
    .filter((t) => !/^\d{3,4}[/\-.]\d{1,3}$/.test(t))
    .join("")
    .replace(/[:;,]+$/, "")
    .trim();
}

/**
 * Quantity, rate and amount out of what sat right of the expiry.
 *
 * The columns are QTY, CC/RATE, AMOUNT, M.R.P., but OCR drops a stray mark
 * between them often enough ("20 ~ 31.03 620.60 36.00") that counting columns
 * does not work. What does work: the quantity is the first bare number, and
 * the money columns are the last three amounts on the row — of which the last
 * is the MRP, which a purchase does not use.
 */
function readRight(right: string[]): {
  qty: number;
  free: boolean;
  unitCostPaisa: number;
  amountPaisa: number;
} | null {
  const free = right.some(isFreeWord);
  const counts = right.filter(looksLikeCount);
  const monies = right.filter((t) => looksLikeMoney(t) && !t.includes("%"));
  const qty = counts.length ? Number(counts[0]) : 0;
  if (qty <= 0) return null;
  if (monies.length === 0) {
    return free ? { qty, free, unitCostPaisa: 0, amountPaisa: 0 } : null;
  }
  if (free) {
    // A free row's rate column holds a percentage ("0.00%", "7.51%"), so the
    // amounts left are the amount and the MRP. The amount is usually nothing;
    // when it is not, the supplier charged for the "free" goods and the money
    // has to stay on the bill.
    const amountPaisa =
      monies.length >= 2 ? (moneyToPaisa(monies[monies.length - 2]!) ?? 0) : 0;
    return {
      qty,
      free,
      unitCostPaisa: amountPaisa > 0 ? Math.round(amountPaisa / qty) : 0,
      amountPaisa,
    };
  }
  // Of rate / amount / MRP, drop the MRP when all three are there.
  const useful = monies.length >= 3 ? monies.slice(-3, -1) : monies.slice(0, 2);
  const unitCostPaisa = moneyToPaisa(useful[0] ?? "0") ?? 0;
  const amountPaisa = moneyToPaisa(useful[1] ?? useful[0] ?? "0") ?? 0;
  return { qty, free, unitCostPaisa, amountPaisa };
}

/* ------------------------------------------------------------------ totals */

/** The bill's own closing figures. Labels come back mangled, so match loosely. */
function readTotals(lines: string[]): Pick<
  ReadInvoice,
  "totalPaisa" | "billDiscountPaisa" | "roundingPaisa" | "netTotalPaisa" | "hasVat"
> {
  let totalPaisa: number | null = null;
  let billDiscountPaisa: number | null = null;
  let roundingPaisa: number | null = null;
  let netTotalPaisa: number | null = null;
  let hasVat = false;

  /** A line that is nothing but one amount. */
  const lone = (l: string | undefined): string | undefined => {
    const t = (l ?? "").trim().split(/\s+/);
    return t.length === 1 && looksLikeMoney(t[0]!) && !t[0]!.includes("%") ? t[0] : undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    // "Taxable Amount" comes back as "TaableAmoumt" as often as not.
    if (/\bVAT\b|TA\w?ABLE\s*AM/i.test(line)) hasVat = true;
    // The figure on a totals line is the last money token on it.
    const tokens = line.split(/\s+/);
    let money = [...tokens].reverse().find((t) => looksLikeMoney(t) && !t.includes("%"));
    // OCR sometimes reads a label and its figure as two lines, either way
    // round ("OFFICE COPY TOTAL" with 6,318.89 above or below it).
    if (!money && /T[O0]TAL|DISC[O0]UNT|R[O0DB]UND/i.test(line)) {
      money = lone(lines[i + 1]) ?? lone(lines[i - 1]);
    }
    if (!money) continue;
    const paisa = moneyToPaisa(money);
    if (paisa === null) continue;
    const negative = /[-~]\s*\d|:\s*-/.test(line) && /R[O0DB]UND/i.test(line);
    // Suppliers close a bill every way there is: NET TOTAL on the dot-matrix
    // bills, Net Amount, Net Payable, Grand Total elsewhere.
    // NET comes back as NE, NEI and HET as well.
    if (/^[^A-Za-z]*(N[E3][TIl1]?|HET|MET)\s*(T[O0]TAL|AM[O0]UNT|PAYA8?BLE)/i.test(line)) {
      netTotalPaisa ??= paisa;
    } else if (/GRAND\s*T[O0]TAL/i.test(line)) {
      netTotalPaisa ??= paisa;
    } else if (/R[O0DB]UND/i.test(line)) {
      roundingPaisa ??= negative ? -Math.abs(paisa) : paisa;
    } else if (/DISC[O0]UNT/i.test(line) && !/TRADE/i.test(line)) {
      billDiscountPaisa ??= paisa;
    } else if (/T[O0]TAL|GR[O0]SS\s*AM/i.test(line)) {
      totalPaisa ??= paisa;
    }
  }
  return { totalPaisa, billDiscountPaisa, roundingPaisa, netTotalPaisa, hasVat };
}

/* ------------------------------------------------------- invoice no. & date */

function readInvoiceNo(lines: string[]): string {
  // "Invoice No.", but also "TnvoicE No." and "Jnvoice No." — the first letter
  // is the one OCR is least sure of, so it is the one not to insist on.
  const labelled = /NV[O0Q]IC[E3]\s*N[O0]/i;
  // Lines that carry a different long number entirely.
  const decoy = /REGD|PAN\b|DDA|MEMBER|TEL|PH:/i;
  const candidate = /^[A-Z]{2,6}\d{4,}$/;
  const pick = (tokens: string[]): string | null => {
    for (const t of tokens) {
      const clean = t.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!candidate.test(clean)) continue;
      const m = /^([A-Z]{2,6})(\d{4,})$/.exec(clean)!;
      let letters = m[1]!;
      let digits = m[2]!;
      // "BASRO002535": the O at the end of the letters is a zero, which the
      // digits that follow give away by starting with one themselves.
      const trailingO = /O+$/.exec(letters)?.[0];
      if (trailingO && digits.startsWith("0") && letters.length - trailingO.length >= 2) {
        letters = letters.slice(0, -trailingO.length);
        digits = "0".repeat(trailingO.length) + digits;
      }
      return letters + digits;
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!labelled.test(lines[i]!)) continue;
    const here = decoy.test(lines[i]!) ? null : pick(lines[i]!.split(/\s+/));
    if (here) return here;
    const after = lines[i + 1];
    if (after && !decoy.test(after)) {
      const next = pick(after.split(/\s+/));
      if (next) return next;
    }
  }
  // No label read: take the first thing on the page shaped like one.
  for (const line of lines) {
    if (decoy.test(line)) continue;
    const here = pick(line.split(/\s+/));
    if (here) return here;
  }
  return "";
}

/**
 * The supplier's transaction date, which these bills print in BS. AD dates sit
 * next to it on the same bill, so the year is what tells them apart: a BS year
 * is in the 2070s and 2080s, an AD one in the 2020s.
 */
function readDateBs(lines: string[]): string {
  for (const line of lines) {
    const m = /\b(20[6-9]\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(line);
    if (!m) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 32) continue;
    return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

/* -------------------------------------------------------------------- main */

/** Where the item rows start and stop, so headers and footers are left alone. */
function itemBand(lines: string[]): [number, number] {
  let start = 0;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/ITE[MN]\s*DESCRI|DESCRIPTI[O0]N/i.test(lines[i]!)) start = i + 1;
    if (/CUST[O0]MER\s*C[O0]|IN\s*WORDS|INW[O0]RDS/i.test(lines[i]!) && i > start) {
      end = Math.min(end, i);
      break;
    }
  }
  return [start, end];
}

/**
 * Put back together a row OCR read as two lines: the description, pack and
 * batch on one ("CALIN LOTION 100ML 1 CN20826") and the expiry and figures on
 * the next ("2028/07 10 112.07 1,120.70 130.00"). Only a line that is not a
 * row by itself is joined, and only to a line that has nothing left of its
 * numbers, so two real rows are never run together.
 */
function rejoinWrapped(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const here = lines[i]!;
    const next = lines[i + 1];
    if (next && /[A-Za-z]{3}/.test(here) && !splitRow(separate(here.split(/\s+/)))) {
      const parts = splitRow(separate(next.split(/\s+/)));
      if (parts && stripSerial(parts.left).length === 0) {
        out.push(`${here} ${next}`);
        i++;
        continue;
      }
    }
    out.push(here);
  }
  return out;
}

export function parseInvoiceText(text: string): ReadInvoice {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const [start, end] = itemBand(lines);
  const out: ReadLine[] = [];
  // A name OCR read onto the row above, waiting for its own row (see dittoSpan).
  let orphanName = "";

  for (const line of rejoinWrapped(lines.slice(start, end))) {
    const tokens = separate(line.split(/\s+/).filter(Boolean));
    if (tokens.length < 4) continue;
    const span = dittoSpan(tokens);
    let ditto = isDitto(line) || span !== null;
    if (span && span[0] > 0) {
      const before = stripSerial(tokens.slice(0, span[0]));
      if (before.some((t) => /[A-Za-z]{3}/.test(t))) {
        orphanName = tidyName(before.join(" "));
      } else if (before.length > 0) {
        // Something other than words before the marker: not a ditto row.
        ditto = isDitto(line);
      }
    }
    const parts = splitRow(tokens);
    if (!parts) continue;
    const right = readRight(parts.right);
    if (!right) continue;
    // A ditto row's own words are the pack and batch after the marker.
    const left = readLeft(
      ditto && span && span[1] < parts.left.length ? parts.left.slice(span[1] + 1) : parts.left,
    );
    if (ditto) left.name = "";

    // Free goods come as a continuation row: "- do -" and the same batch
    // again, priced at nothing. That is bonus stock on the row above, not a
    // line of its own — and it stays bonus stock even when OCR loses the
    // "- do -" itself and leaves the row with no name at all.
    const previous = out[out.length - 1];
    if (right.free && previous && (ditto || !left.name)) {
      if (right.amountPaisa <= 0) {
        previous.freeQty += right.qty;
        continue;
      }
      // "Free" goods the supplier charged for (Sohan's 7.51% rows). Folding
      // them into the bonus would drop the money off the bill, so they become
      // a line of their own at what was charged.
      out.push({
        printedName: previous.printedName,
        pack: left.pack || previous.pack,
        batchNo: left.batchNo || previous.batchNo,
        expiryAdMonth: parts.expiry || previous.expiryAdMonth,
        qty: right.qty,
        freeQty: 0,
        unitCostPaisa: right.unitCostPaisa,
        amountPaisa: right.amountPaisa,
        amountDisagrees: Math.abs(right.qty * right.unitCostPaisa - right.amountPaisa) > 50,
      });
      continue;
    }

    // A "- do -" row that is not free is a second batch of the same medicine,
    // so it becomes a line of its own carrying the name down. A row that lost
    // its name to the row above gets it back.
    let name = ditto && previous ? previous.printedName : left.name;
    if (!ditto && !name && orphanName) name = orphanName;
    if (!ditto) orphanName = "";

    // Two kinds of row are not rows at all, and are dropped rather than put in
    // front of the person to delete: one with neither a name nor a batch on
    // it, which is a stray line of figures OCR lifted off the page, and one
    // priced at nothing that is not marked free.
    if (!name && !left.batchNo) continue;
    if (!right.free && right.amountPaisa === 0) continue;

    const expected = right.qty * right.unitCostPaisa;
    out.push({
      printedName: name,
      pack: left.pack,
      batchNo: left.batchNo,
      expiryAdMonth: parts.expiry,
      qty: right.qty,
      freeQty: 0,
      unitCostPaisa: right.unitCostPaisa,
      amountPaisa: right.amountPaisa,
      // Half a rupee of slack for the supplier's own rounding of qty x rate.
      amountDisagrees: Math.abs(expected - right.amountPaisa) > 50,
    });
  }

  return {
    invoiceNo: readInvoiceNo(lines),
    dateBs: readDateBs(lines),
    lines: out,
    ...readTotals(lines.slice(Math.max(start, 0))),
  };
}
