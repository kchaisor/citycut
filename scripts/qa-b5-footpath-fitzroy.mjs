import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const lat = -37.8131;
const lon = 144.98;
const km = 0.35;
const planClip = { x: 430, y: 56, width: 860, height: 820 };

async function capture(page, filletM, dest) {
  await page.addInitScript(({ fillet }) => {
    document.documentElement.style.setProperty("--path-fillet-m", String(fillet));
    document.documentElement.style.setProperty("--path-edge", "on");
    document.documentElement.style.setProperty("--path-edge-mm", "0.08");
  }, { fillet: filletM });
  await page.goto(`${base}?qa=1&view=persp&lat=${lat}&lon=${lon}&km=${km}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 20,
    null,
    { timeout: 180_000 },
  );
  await page.locator(".model-chrome").getByRole("button", { name: "Drawing", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Site plan", exact: true }).click();
  await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.getByLabel("Plan scale", { exact: true }).selectOption("500");
  await page.waitForTimeout(500);
  const svg = page.locator(".fill.is-plan svg.plan");
  await svg.click({ position: { x: 400, y: 350 }, force: true });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Equal");
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: dest, clip: planClip });
}

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const beforePage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
beforePage.setDefaultTimeout(120_000);
await capture(beforePage, 0, `${outDir}/b5-footpath-fitzroy-before.png`);
await beforePage.close();
const afterPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
afterPage.setDefaultTimeout(120_000);
await capture(afterPage, 2, `${outDir}/b5-footpath-fitzroy-after.png`);
await afterPage.close();
await browser.close();
console.log("Fitzroy footpath 1:500 crops written");
