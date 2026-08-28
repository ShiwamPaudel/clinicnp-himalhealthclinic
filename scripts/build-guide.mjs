/**
 * build-guide.mjs — assembles prod-docs/guide/Faarma-User-Guide.html from the
 * captured screenshots + the written walkthrough below. Images are embedded as
 * data URIs so the file is fully self-contained: open it in any browser and
 * "Save as PDF" (or Ctrl/Cmd+P → Save as PDF) to produce the printed guide.
 *
 * Regenerate after re-capturing:  node scripts/build-guide.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDE = join(__dirname, "..", "prod-docs", "guide");
const SCREENS = join(GUIDE, "screens");
const PUBLIC = join(__dirname, "..", "public");

function dataUri(absPath) {
  if (!existsSync(absPath)) {
    console.warn("missing image:", absPath);
    return "";
  }
  const b64 = readFileSync(absPath).toString("base64");
  return `data:image/png;base64,${b64}`;
}
const shot = (slug) => dataUri(join(SCREENS, `${slug}.png`));
const logo = dataUri(join(PUBLIC, "brand", "logo.png"));

// ---- The walkthrough content -------------------------------------------------
// Plain language only. Each section pairs a real screenshot with what the user
// sees and what to do. `n` numbers appear in the printed table of contents.
const CHAPTERS = [
  {
    id: "start",
    title: "1 · Getting started",
    sections: [
      {
        img: "01-login",
        title: "Signing in",
        blurb:
          "Faarma opens to a sign-in screen. Every person who works the counter gets their own username so the shop always knows who made each bill.",
        points: [
          "Type your <b>username</b> and <b>password</b>, then press <b>Log in</b> (or hit Enter).",
          "Demo logins for trying things out: <b>admin / admin123</b> (Owner) and <b>bikash / staff123</b> (Counter staff).",
          "Get the password wrong too many times in a row and Faarma pauses sign-in for a few minutes. This is on purpose — it stops anyone guessing their way in. Just wait and try again.",
          "Owners see every tab. Counter staff see only what they need for billing and stock — this keeps the shop's numbers safe.",
        ],
      },
    ],
  },
  {
    id: "dashboard",
    title: "2 · Dashboard",
    sections: [
      {
        img: "02-dashboard",
        title: "Your shop at a glance",
        blurb:
          "The Dashboard is the first thing you see after signing in. It answers 'how is the shop doing today?' without you having to open a single report.",
        points: [
          "The four cards across the top show <b>today's sales</b>, <b>this month</b>, the running <b>fiscal-year</b> total, and how many <b>bills</b> you've made today.",
          "The three cards below are early warnings: <b>Low stock</b>, <b>Near expiry</b>, and <b>Expired</b>. A number above zero means something needs your attention — click through to Stock to see which items.",
          "The <b>Sales — last 30 days</b> graph shows the shape of your week and month at a glance.",
          "<b>Top items this month</b> tells you what's actually moving, so you know what to reorder first.",
          "Dates everywhere are in <b>Bikram Sambat</b> — the top-right shows today's Nepali date.",
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "3 · New bill (the counter)",
    sections: [
      {
        img: "03-billing",
        title: "Making a sale",
        blurb:
          "This is where you spend most of your day. It's built to be fast and keyboard-first — you rarely need the mouse. The left side is the bill; the green panel on the right is the money.",
        points: [
          "Start typing a medicine name in the <b>search box</b> and press <b>Enter</b> to add it to the bill. Keep searching to add more lines.",
          "For each line you can change the <b>quantity</b>, pick the <b>unit</b> (tablet, strip, box…), and — if you're allowed — nudge the <b>rate</b>. An edited rate shows a small mark so it's never hidden.",
          "Prefer to tap? Hit the <b>grid button</b> next to the quantity (or press <b>G</b>) to pick the amount visually — see the next page.",
          "Faarma always sells the <b>nearest-to-expiry stock first</b>, automatically. You never sell an expired batch by accident — those are locked out.",
          "You <b>can't oversell</b> — if a line is short on stock, saving is blocked until you lower the quantity or add the stock (record a purchase).",
          "On the right: enter any <b>bill discount</b>, choose <b>Cash</b>, <b>QR</b>, or <b>Credit</b>, type what the customer <b>tendered</b>, and Faarma shows the <b>change</b>.",
          "Press <b>F9</b> (or <b>Save &amp; print</b>) to finish. The bill prints and stock comes down on its own.",
          "No internet? Keep billing. Faarma works offline and quietly sends the bills the moment you're back online — the top of the screen tells you what's waiting.",
          "Not ready to finish a bill? <b>Held</b> (top right) parks it so you can start another and come back.",
          "Use <b>Back to app</b> (top left) to return to the dashboard any time.",
        ],
      },
      {
        img: "03b-visual-picker",
        title: "Pick the quantity visually",
        blurb:
          "Numbers all look alike; medicines don't. The <b>Unit</b> panel under the bill draws the actual item — capsules in a real strip, a bottle, a box — so you can tap what you're selling. Great on a touch screen, and it makes 'a strip and a half' obvious. What it draws comes from the item's form, set when you add the medicine.",
        points: [
          "Tap a capsule/tablet to set the quantity up to there — selling 4 loose ones? Tap the 4th. A part-used strip shows as <b>cut</b>, matching the shelf.",
          "The <b>packs on the left</b> (Box, Strip, Tablet) are quick-adds — tap <b>Strip</b> to add a whole strip (+10), <b>Box</b> to add a box.",
          "The running total shows both ways — e.g. <b>1 Strip + 4 Tablet</b> and the exact price — with <b>+ / −</b> for fine control.",
          "It sells in the smallest unit at that unit's price; the <b>Box / Strip / Tablet</b> chip on the bill line still switches to bulk pricing.",
        ],
      },
    ],
  },
  {
    id: "stock",
    title: "4 · Stock",
    sections: [
      {
        img: "04-stock",
        title: "What's on the shelf",
        blurb:
          "Stock shows how much of every medicine you have right now, counted in the smallest unit so the number is always honest.",
        points: [
          "Each row is one medicine with its total quantity on hand and its value.",
          "The tabs let you jump straight to the lists that matter: <b>Low</b>, <b>Near expiry</b>, and <b>Expired</b>.",
          "Quantities read the way you stock — for example '4 Box + 3 Strip + 6 Tablet' — so you can match them to the shelf without doing maths.",
        ],
      },
      {
        img: "05-stock-low",
        title: "Low stock — what to reorder",
        blurb:
          "This list is your reorder sheet. Anything that has dropped below the minimum you set for it shows up here.",
        points: [
          "Set each medicine's minimum on its Item page; when stock falls under it, the item lands here.",
          "Use this before you call a supplier so nothing runs out mid-week.",
        ],
      },
      {
        img: "06-stock-near-expiry",
        title: "Near expiry — sell or return soon",
        blurb:
          "Medicines that will expire soon, so you can push them, return them, or move them before they become a loss.",
        points: [
          "The 'soon' window is set in Settings (for example, the next 90 days).",
          "Faarma already sells these first at the counter — this list is for the ones you may want to return to the supplier.",
        ],
      },
      {
        img: "07-stock-expired",
        title: "Expired — pull these off the shelf",
        blurb:
          "Anything past its expiry date. These are never sold to a customer — Faarma blocks them — but you still need to account for them.",
        points: [
          "Use the action here to write off expired stock so your on-hand numbers stay truthful.",
          "Every write-off is recorded, so the value that left your shelf is always explainable.",
        ],
      },
    ],
  },
  {
    id: "items",
    title: "5 · Items",
    sections: [
      {
        img: "08-items",
        title: "Your medicine list",
        blurb:
          "Items is the master list of everything you sell. You set a medicine up once here, and the counter, stock, and reports all use it.",
        points: [
          "Add a medicine with its name, generic name, category, and rack location.",
          "Set the <b>units</b> and how they nest — for example 1 Box = 10 Strip, 1 Strip = 10 Tablet — and the selling rate. The counter then handles every unit for you.",
          "Set a <b>minimum stock</b> so the medicine shows up on the Low-stock list when it runs down.",
          "Turn a medicine <b>off</b> to hide it from the counter without losing its history.",
          "Use the <b>Edit</b> button on any row to change it later.",
        ],
      },
      {
        img: "08b-items-new",
        title: "Adding a medicine — and its look",
        blurb:
          "When you add an item, the <b>Looks like</b> row lets you pick its form — capsule, tablet, blister strip, bottle, box, tube, sachet, drops or vial. That choice is what the counter draws in the visual Unit panel, so staff recognise the medicine at a glance.",
        points: [
          "Pick the <b>form</b> that matches the medicine — a syrup is a Bottle, an antibiotic is a Capsule, and so on.",
          "Everything but the name and units is optional — the extra fields hide under <b>More options</b> to keep it quick.",
        ],
      },
    ],
  },
  {
    id: "purchases",
    title: "6 · Purchases",
    sections: [
      {
        img: "09-purchases",
        title: "Stock coming in",
        blurb:
          "Purchases is the record of stock you've bought. Entering a purchase here is what puts medicines onto your shelf.",
        points: [
          "Each entry is one supplier bill, with the batches and quantities you received.",
          "Recording a purchase adds that stock automatically — you don't adjust counts by hand.",
        ],
      },
      {
        img: "10-purchases-new",
        title: "Entering a new purchase",
        blurb:
          "Copy a supplier's invoice into Faarma: pick the supplier, add each medicine with its batch number, expiry, cost, and quantity.",
        points: [
          "Enter the <b>batch number</b> and <b>expiry date</b> for each line — this is what powers sell-oldest-first and the expiry warnings.",
          "Enter the <b>cost</b> you paid; Faarma uses it to work out real profit later, batch by batch.",
          "Save, and every line lands on the shelf and in your supplier's ledger.",
        ],
      },
      {
        img: "11-purchases-returns",
        title: "Returning to a supplier",
        blurb:
          "Sending stock back — damaged, wrong, or near expiry? Record it here so your on-hand count and the supplier's balance both stay correct.",
        points: [
          "Pick the batch you're returning and the quantity; the stock comes off the shelf.",
          "The supplier's ledger updates so you're never over- or under-paying.",
        ],
      },
    ],
  },
  {
    id: "suppliers",
    title: "7 · Suppliers",
    sections: [
      {
        img: "12-suppliers",
        title: "Who you buy from",
        blurb:
          "Suppliers keeps your distributors and how much you owe each one, all in one place.",
        points: [
          "Each supplier shows a running <b>balance</b> — what you still owe after purchases and payments.",
          "Open a supplier to see their full history and to record a payment you've made.",
        ],
      },
    ],
  },
  {
    id: "bills",
    title: "8 · Bills",
    sections: [
      {
        img: "13-bills",
        title: "Every sale you've made",
        blurb:
          "Bills is the searchable record of every sale. Come here to reprint, review, or fix a bill.",
        points: [
          "Open any bill to see its lines and <b>reprint</b> it for a customer.",
          "Made a mistake? <b>Cancel</b> a bill — the stock returns to the shelf and the bill keeps its number so nothing is ever quietly deleted.",
          "Take back part of a sale with a <b>return</b>; the medicine goes back on the shelf and the day's totals adjust.",
          "<b>Credit</b> bills that haven't been paid are easy to find and settle here.",
        ],
      },
    ],
  },
  {
    id: "reports",
    title: "9 · Reports",
    sections: [
      {
        img: "14-reports",
        title: "The report shelf",
        blurb:
          "Reports turn the day's work into numbers you can act on or hand to your accountant. Every report can be exported to Excel.",
        points: [
          "Pick a report from the list; most let you choose a date range in Nepali dates.",
          "Use <b>Export</b> on any report to get a clean Excel file.",
        ],
      },
      {
        img: "15-reports-day-close",
        title: "Day close",
        blurb:
          "The end-of-day summary: what you sold, by payment type, and how much cash you should have in the drawer.",
        points: [
          "Shows gross sales, returns, and the <b>expected cash</b> to count against your drawer.",
          "Run it before you lock up so any difference is caught the same day.",
        ],
      },
      {
        img: "16-reports-sales-register",
        title: "Sales register",
        blurb: "Every bill in a date range, line by line — the full sales record for the period.",
        points: ["Great for cross-checking a busy day or handing sales to your accountant."],
      },
      {
        img: "17-reports-profit",
        title: "Profit by item",
        blurb:
          "What you actually earned, medicine by medicine. Profit is worked out from the real cost of the exact batches you sold — not a guess.",
        points: [
          "Returns are already subtracted, so the profit shown is what you really kept.",
          "Use it to see which medicines are worth the shelf space.",
        ],
      },
      {
        img: "18-reports-purchase-register",
        title: "Purchase register",
        blurb: "Every purchase in a date range — what you bought and from whom.",
        points: ["Handy for reconciling supplier statements at month end."],
      },
      {
        img: "19-reports-valuation",
        title: "Stock valuation",
        blurb: "What the stock on your shelf is worth right now, at cost.",
        points: ["A quick answer to 'how much money is sitting on my shelves?'"],
      },
      {
        img: "20-reports-vat",
        title: "VAT summary",
        blurb: "The VAT side of your sales, gathered for your tax filing.",
        points: ["Export it and hand it to your accountant at filing time."],
      },
      {
        img: "21-reports-expiry",
        title: "Expiry report",
        blurb: "A forward look at what's expiring and when, so nothing surprises you.",
        points: ["Plan returns and push near-expiry stock before it becomes a loss."],
      },
      {
        img: "22-reports-moving",
        title: "Moving items",
        blurb: "Your fast and slow sellers over a period.",
        points: ["Reorder the fast movers; rethink the slow ones."],
      },
    ],
  },
  {
    id: "settings",
    title: "10 · Settings",
    sections: [
      {
        img: "23-settings-company",
        title: "Company details",
        blurb:
          "Set up your shop once: name, address, PAN, and the choices that shape your bills and warnings. This is Owner-only.",
        points: [
          "Your <b>name, address, PAN/DDA</b> and <b>invoice footer</b> print on every bill.",
          "Choose your <b>print format</b> (thermal or A5), the <b>near-expiry window</b>, and whether to <b>round</b> the grand total.",
          "Turn on a warning if a rate is ever set <b>below what you paid</b>.",
        ],
      },
      {
        img: "24-settings-users",
        title: "Users",
        blurb: "Add the people who work the shop and decide what each can do.",
        points: [
          "Give each person a login and a role: <b>Owner</b> (sees everything) or <b>Counter staff</b> (billing and stock).",
          "Decide who is allowed to <b>edit the rate</b> on a bill.",
          "A quick <b>PIN</b> lets staff switch users at a shared counter without a full sign-out.",
          "Turn a user <b>off</b> when they leave — their past bills stay intact.",
        ],
      },
      {
        img: "25-settings-compliance",
        title: "Compliance (CBMS)",
        blurb:
          "If your shop reports sales to the government's billing system, Faarma can queue and send them here.",
        points: [
          "Turn it on and enter your details; Faarma sends bills in the background.",
          "The status here shows what has been sent and what's still waiting.",
        ],
      },
      {
        img: "26-settings-backup",
        title: "Backup &amp; restore",
        blurb:
          "Your shop's whole record can be saved to a file and, if ever needed, put back exactly as it was.",
        points: [
          "<b>Download a backup</b> any time to keep a copy safe off the machine. Faarma also backs up nightly on its own.",
          "<b>Restore</b> replaces everything with a backup file. It asks you to type a confirmation first, and it's all-or-nothing — it can never leave your data half-changed.",
        ],
      },
      {
        img: "27-settings-audit",
        title: "Activity log",
        blurb:
          "A plain record of the important things that happened — cancelled bills, write-offs, restores — and who did them.",
        points: [
          "Use it to answer 'who did this, and when?' without guesswork.",
          "You can look but not edit — that's what makes it trustworthy.",
        ],
      },
    ],
  },
];

// ---- HTML assembly -----------------------------------------------------------
const GREEN = "#20342a";
const GREEN2 = "#35553f";
const ORANGE = "#e87e28";
const CREAM = "#faf6eb";
const LINE = "#e3dbc6";

let toc = "";
let body = "";
let n = 0;
for (const ch of CHAPTERS) {
  body += `<section class="chapter"><h2 id="${ch.id}">${ch.title}</h2>`;
  for (const s of ch.sections) {
    n++;
    toc += `<li><span class="toc-n">${String(n).padStart(2, "0")}</span> ${s.title}<span class="toc-ch">${ch.title.split("·")[1].trim()}</span></li>`;
    body += `
      <article class="shot">
        <h3>${s.title}</h3>
        <p class="blurb">${s.blurb}</p>
        <figure><img src="${shot(s.img)}" alt="${s.title}"/></figure>
        <ul class="points">${s.points.map((p) => `<li>${p}</li>`).join("")}</ul>
      </article>`;
  }
  body += `</section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Faarma — User Guide</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: ${GREEN}; background: #fff;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12.5px; line-height: 1.5;
  }
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 24px 60px; }

  /* Cover */
  .cover {
    min-height: 90vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    page-break-after: always;
  }
  .cover img { width: 260px; max-width: 60%; margin-bottom: 28px; }
  .cover h1 { font-size: 40px; margin: 0; letter-spacing: -0.5px; }
  .cover .sub { color: ${GREEN2}; font-size: 16px; margin-top: 8px; }
  .cover .meta { margin-top: 40px; color: ${GREEN2}; font-size: 12px; }
  .cover .rule { width: 64px; height: 4px; background: ${ORANGE}; border-radius: 999px; margin: 24px auto 0; }

  /* Intro + TOC */
  .card {
    background: ${CREAM}; border: 1px solid ${LINE}; border-radius: 12px;
    padding: 20px 24px; margin: 22px 0;
  }
  .card h2 { margin-top: 0; }
  .lede { font-size: 14px; }
  .concepts { list-style: none; padding: 0; margin: 12px 0 0; }
  .concepts li { padding: 8px 0; border-top: 1px solid ${LINE}; }
  .concepts li:first-child { border-top: 0; }
  .concepts b { color: ${ORANGE}; }

  ol.toc { list-style: none; padding: 0; margin: 0; counter-reset: none; }
  ol.toc li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 6px 0; border-bottom: 1px dotted ${LINE};
  }
  .toc-n { color: ${ORANGE}; font-weight: 700; font-variant-numeric: tabular-nums; }
  .toc-ch { margin-left: auto; color: ${GREEN2}; font-size: 11px; opacity: .8; }

  h2 {
    font-size: 22px; margin: 40px 0 4px; padding-bottom: 8px;
    border-bottom: 2px solid ${GREEN}; page-break-after: avoid;
  }
  .chapter { page-break-before: always; }

  .shot { page-break-inside: avoid; margin: 26px 0; }
  .shot h3 { font-size: 16px; margin: 0 0 4px; color: ${GREEN}; }
  .shot h3::before {
    content: ""; display: inline-block; width: 8px; height: 8px;
    background: ${ORANGE}; border-radius: 2px; margin-right: 8px; vertical-align: middle;
  }
  .blurb { margin: 0 0 12px; color: #2c3b32; }
  figure { margin: 0 0 12px; }
  figure img {
    width: 100%; height: auto; display: block;
    border: 1px solid ${LINE}; border-radius: 10px;
    box-shadow: 0 1px 2px rgba(22,36,27,.08), 0 6px 18px rgba(22,36,27,.06);
  }
  ul.points { margin: 0; padding-left: 0; list-style: none; }
  ul.points li {
    position: relative; padding: 5px 0 5px 22px;
  }
  ul.points li::before {
    content: ""; position: absolute; left: 4px; top: 11px;
    width: 6px; height: 6px; background: ${GREEN2}; border-radius: 999px;
  }
  ul.points b { color: ${GREEN}; }
  .foot { margin-top: 40px; text-align: center; color: ${GREEN2}; font-size: 11px; }
  a { color: ${GREEN}; }
  @media screen {
    body { background: #ece7d8; }
    .wrap { background: #fff; box-shadow: 0 4px 30px rgba(0,0,0,.1); margin-top: 24px; margin-bottom: 24px; }
    .printhint {
      position: sticky; top: 0; z-index: 10; background: ${GREEN}; color: ${CREAM};
      text-align: center; padding: 10px; font-size: 12.5px;
    }
    .printhint b { color: ${ORANGE}; }
  }
  @media print { .printhint { display: none; } }
</style>
</head>
<body>
<div class="printhint">To save as PDF: press <b>Ctrl/Cmd + P</b> → Destination <b>Save as PDF</b> → Save. (This bar won't be printed.)</div>
<div class="wrap">

  <div class="cover">
    <img src="${logo}" alt="Faarma"/>
    <h1>User Guide</h1>
    <div class="sub">Pharmacy billing &amp; stock, made simple</div>
    <div class="rule"></div>
    <div class="meta">A walk through every screen · For shop owners and counter staff</div>
  </div>

  <div class="card">
    <h2>Welcome to Faarma</h2>
    <p class="lede">Faarma runs your pharmacy counter and your stock room from one place — billing customers, tracking every batch, and turning the day's work into clear numbers. This guide walks through each screen with a real picture and plain steps. No jargon.</p>
    <ul class="concepts">
      <li><b>Nepali dates.</b> Every date is in Bikram Sambat, the way you already work.</li>
      <li><b>Sells the oldest first.</b> Faarma always picks the nearest-to-expiry batch, and never sells an expired one.</li>
      <li><b>Works offline.</b> Keep billing with no internet; bills send themselves when you're back online.</li>
      <li><b>Two roles.</b> Owners see everything; counter staff see billing and stock. Set this up in Settings → Users.</li>
      <li><b>Try it now.</b> Sign in with <b>admin / admin123</b> to explore with sample data.</li>
    </ul>
  </div>

  <div class="card">
    <h2>What's inside</h2>
    <ol class="toc">${toc}</ol>
  </div>

  ${body}

  <div class="foot">Faarma · User Guide · Generated ${new Date().toISOString().slice(0, 10)}</div>
</div>
</body>
</html>`;

const out = join(GUIDE, "Faarma-User-Guide.html");
writeFileSync(out, html, "utf8");
console.log("guide written →", out, `(${(html.length / 1024 / 1024).toFixed(1)} MB)`);
