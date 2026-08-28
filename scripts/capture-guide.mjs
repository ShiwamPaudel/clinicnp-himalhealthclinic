/**
 * capture-guide.mjs — logs into a running Faarma instance and screenshots every
 * tab/section into prod-docs/guide/screens/. Feeds the printable user guide.
 *
 * Usage:  BASE=http://localhost:3100 node scripts/capture-guide.mjs
 * Assumes the seeded demo login (admin / admin123).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const USER = process.env.SEED_USER || "admin";
const PASS = process.env.SEED_PASS || "admin123";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "prod-docs", "guide", "screens");
mkdirSync(OUT, { recursive: true });

// Every screen the guide documents. `wait` gives slow renders (charts) room.
const SHOTS = [
  { slug: "02-dashboard", path: "/dashboard", wait: 1400 },
  { slug: "03-billing", path: "/billing", wait: 700 },
  { slug: "04-stock", path: "/stock" },
  { slug: "05-stock-low", path: "/stock/low" },
  { slug: "06-stock-near-expiry", path: "/stock/near-expiry" },
  { slug: "07-stock-expired", path: "/stock/expired" },
  { slug: "08-items", path: "/items" },
  { slug: "09-purchases", path: "/purchases" },
  { slug: "10-purchases-new", path: "/purchases/new", wait: 500 },
  { slug: "11-purchases-returns", path: "/purchases/returns" },
  { slug: "12-suppliers", path: "/suppliers" },
  { slug: "13-bills", path: "/bills" },
  { slug: "14-reports", path: "/reports" },
  { slug: "15-reports-day-close", path: "/reports/day-close", wait: 500 },
  { slug: "16-reports-sales-register", path: "/reports/sales-register", wait: 500 },
  { slug: "17-reports-profit", path: "/reports/profit", wait: 500 },
  { slug: "18-reports-purchase-register", path: "/reports/purchase-register", wait: 500 },
  { slug: "19-reports-valuation", path: "/reports/valuation", wait: 500 },
  { slug: "20-reports-vat", path: "/reports/vat", wait: 500 },
  { slug: "21-reports-expiry", path: "/reports/expiry", wait: 500 },
  { slug: "22-reports-moving", path: "/reports/moving", wait: 500 },
  { slug: "23-settings-company", path: "/settings/company", wait: 400 },
  { slug: "24-settings-users", path: "/settings/users" },
  { slug: "25-settings-compliance", path: "/settings/compliance" },
  { slug: "26-settings-backup", path: "/settings/backup" },
  { slug: "27-settings-audit", path: "/settings/audit" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();

// Capture the login screen first, while still signed out (an authenticated
// session redirects /login → /dashboard).
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "01-login.png"), fullPage: false });
console.log("captured 01-login");

// Log in once; the session cookie carries across the whole run.
await page.fill("#username", USER);
await page.fill("#password", PASS);
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 20000 }),
  page.click('button[type="submit"]'),
]);
console.log("logged in");

for (const shot of SHOTS) {
  try {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 30000 });
    // let fonts settle + any chart/entry animation finish
    await page.waitForTimeout(shot.wait ?? 250);
    await page.screenshot({ path: join(OUT, `${shot.slug}.png`), fullPage: false });
    console.log("captured", shot.slug);
  } catch (err) {
    console.error("FAILED", shot.slug, err.message);
  }
}

await browser.close();
console.log("done →", OUT);
