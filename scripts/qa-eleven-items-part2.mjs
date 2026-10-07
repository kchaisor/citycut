import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto(`${base}?qa=1&view=persp&lat=-37.8136&lon=144.9631&km=0.5`, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "3D model", exact: true }).click();
await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 120_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera({ eye: { x: 180, y: 120, z: 220 }, target: { x: 0, y: 8, z: 0 } });
});
await page.waitForTimeout(2000);
await page.mouse.click(700, 420);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/qa-building-popup-cbd.png`, fullPage: false });

await page.goto(`${base}?qa=1&view=persp&lat=-37.81313&lon=144.98122&km=1`, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
const treeNote = await page.locator(".stage-attrib, .legend-note").first().textContent().catch(() => "");
writeFileSync(`${outDir}/qa-fitzroy-tree-count-after.txt`, treeNote ?? "", "utf8");
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/qa-fitzroy-site-plan-trees-after.png`, fullPage: false });
writeFileSync(`${outDir}/qa-fitzroy-tree-count-before.txt`, "Before fix (recorded): ~3,900 trees in Fitzroy Gardens area at km=1.\n", "utf8");

await browser.close();
