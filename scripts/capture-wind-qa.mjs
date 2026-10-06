/**
 * QA: wind-annual-3d, wind-summer-3d, plan-uniform-dashdot (Hamilton St site).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const ADDRESS = "20 Hamilton Street, Mont Albert VIC";
const KM = 0.4;

const cameraPose = {
  eye: { x: -280, y: 220, z: -280 },
  look: { x: 0, y: 6, z: 0 },
};

async function configureLayers(page) {
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const drawer = page.locator(".drawer-section:not([hidden])");
  await drawer.waitFor({ state: "visible" });
  const slider = drawer.locator('input[type="range"]');
  await slider.fill(String(KM));
  const row = drawer.locator("li").filter({ hasText: "Trees" });
  const toggle = row.locator("button.toggle");
  if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto("http://127.0.0.1:5173/citycut-export/?qa=1&buildings=uniform", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);

await page.getByRole("button", { name: "Search", exact: true }).click();
await page.getByRole("combobox", { name: /Search a place/i }).fill(ADDRESS);
await page.waitForTimeout(1500);
await page.getByRole("option").first().click();
await page.waitForTimeout(800);

await configureLayers(page);

await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(6000);

await page.getByRole("button", { name: "Buildings", exact: true }).click();
await page.getByRole("button", { name: "Uniform colour", exact: true }).click().catch(() => {});

await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.getByLabel("Wind on").check();
await page.locator(".wind-drawer select").selectOption("annual");
await page.waitForTimeout(18000);

await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
await page.evaluate((p) => {
  window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
}, cameraPose);
await page.waitForTimeout(2500);

await page.locator(".viewport canvas").screenshot({ path: `${outDir}/wind-annual-3d.png` });

await page.locator(".wind-drawer select").selectOption("summer");
await page.waitForTimeout(3000);
await page.locator(".viewport canvas").screenshot({ path: `${outDir}/wind-summer-3d.png` });

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("tab", { name: "Drawing" }).click();
await page.waitForSelector(".fill.is-plan svg");
await page.locator('select[aria-label="Plan scale"]').selectOption("1000");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

const svg = page.locator(".fill.is-plan svg");
const box = await svg.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.48);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -140);
    await page.waitForTimeout(100);
  }
}
if (box) {
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
}
await page.waitForTimeout(300);
await svg.screenshot({ path: `${outDir}/plan-uniform-dashdot.png` });

await browser.close();
console.log("saved QA shots to", outDir);
