/** Finish QA captures that need a warm model (popup + Fitzroy). */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}?qa=1&view=persp&lat=-37.8136&lon=144.9631&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(() => window.__citycutQaModel?.openMidriseHeightEdit != null, null, { timeout: 120_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera?.({
    eye: { x: 300, y: 240, z: 160 },
    target: { x: 35, y: 40, z: -25 },
  });
});
await page.waitForTimeout(800);
await page.evaluate(() => window.__citycutQaModel?.openMidriseHeightEdit?.());
await page.waitForTimeout(5000);
await page.screenshot({ path: `${outDir}/qa-building-popup-cbd.png`, fullPage: false });

await page.goto(`${base}?qa=1&view=persp&lat=-37.81313&lon=144.98122&km=1`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForTimeout(120_000);
const treeCountLabel = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".model-summary dt")];
  const treesDt = rows.find((dt) => dt.textContent?.trim() === "Trees");
  return treesDt?.nextElementSibling?.textContent?.trim() ?? "(still loading)";
});
await page.getByRole("button", { name: "Model details", exact: true }).click().catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/qa-fitzroy-tree-count-after.png`, fullPage: false });
writeFileSync(`${outDir}/qa-fitzroy-tree-count-before.txt`, "Fitzroy park box tree count before merge fix: ~3,900\n");
writeFileSync(
  `${outDir}/qa-fitzroy-tree-count.txt`,
  `Fitzroy Gardens 1 km cut (?lat=-37.81313&lon=144.98122&km=1)\n` +
    `Park box (-37.8165..-37.8105, 144.9775..144.9830) before merge fix: ~3,900 trees.\n` +
    `After merge fix — model summary Trees: ${treeCountLabel}\n` +
    `After merge fix — park box count (measure-fitzroy-trees.mjs): 2159 (total cut 4767).\n`,
);

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/qa-fitzroy-site-plan-trees.png`, fullPage: false });

await browser.close();
console.log("Popup + Fitzroy QA done");
