/**
 * QA: Site plan and Figure-ground share the same framing at one cut URL.
 * npx vite-node scripts/qa-plan-view-toggle.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const figurePath = `${outDir}/qa-melbourne-figure-ground-plan.png`;
const sitePath = `${outDir}/qa-melbourne-site-plan.png`;

const url = "http://127.0.0.1:4173/citycut/?lat=-37.8136&lon=144.9631&km=0.5";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
await page.locator(".viewport-hint").waitFor({ timeout: 180_000 });
await page.waitForTimeout(2000);

for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.waitForTimeout(500);

await page.getByRole("button", { name: "Figure-ground" }).click();
await page.waitForTimeout(800);
await page.locator("svg.plan").waitFor({ timeout: 30_000 });
await page.screenshot({ path: figurePath, fullPage: false });

await page.getByRole("button", { name: "Site plan" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: sitePath, fullPage: false });

console.log("Saved", figurePath);
console.log("Saved", sitePath);
await browser.close();
