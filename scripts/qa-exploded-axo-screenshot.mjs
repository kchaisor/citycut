import { chromium } from "playwright";

const base = process.env.QA_BASE ?? "http://localhost:4173/citycut/";

async function capture(shape, outPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const query =
    shape === "circle"
      ? "?lat=-37.8136&lon=144.9631&km=0.5&shape=circle"
      : "?lat=-37.8136&lon=144.9631&km=0.5";
  await page.goto(`${base}${query}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await page.getByRole("heading", { name: /Your model is ready/i }).waitFor({ timeout: 180_000 });
  await page.getByRole("button", { name: "Drawing" }).click();
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("button", { name: "Exploded axo" }).click();
  await page.locator("svg.plan.exploded-axo").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();
  console.log("saved", outPath);
}

await capture("square", "/opt/cursor/artifacts/exploded-axo-square-0.5km.png");
await capture("circle", "/opt/cursor/artifacts/exploded-axo-circle-0.5km.png");
