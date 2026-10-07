import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://127.0.0.1:4173/citycut/";
const query = "?lat=-37.8270&lon=145.0040&km=1&shape=circle";

async function openAxo(page, onlyLayer) {
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await page.getByRole("heading", { name: /Your model is ready/i }).waitFor({ timeout: 300000 });
  await page.getByRole("button", { name: "Drawing" }).click();
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("button", { name: "Exploded axo" }).click();
  const labels = ["PLANNING", "FLOODPLAIN", "HYDRO", "TRANSPORT", "TOPOGRAPHY", "ROADS", "GREEN SPACES", "BUILDINGS", "SATELLITE"];
  for (const label of labels) {
    const cb = page.locator(".axo-layer-list label.check-field").filter({ hasText: label }).locator("input");
    if (!(await cb.count())) continue;
    const on = label === onlyLayer || label === "SATELLITE";
    if (await cb.isChecked()) {
      if (!on) await cb.uncheck();
    } else if (on) {
      await cb.check();
    }
  }
  await page.getByRole("button", { name: "Fit frame" }).click();
  await page.waitForTimeout(12000);
}

async function cropLayer(onlyLayer, outPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await openAxo(page, onlyLayer);
  const svg = page.locator("svg.plan.exploded-axo");
  await svg.screenshot({ path: outPath });
  await browser.close();
  console.log("saved", outPath);
}

await cropLayer("HYDRO", "/opt/cursor/artifacts/exploded-axo-richmond-hydro-crop.png");
await cropLayer("TRANSPORT", "/opt/cursor/artifacts/exploded-axo-richmond-transport-crop.png");
