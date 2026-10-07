import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.env.QA_BASE ?? "http://localhost:4173/citycut/";
// Richmond: shift ~700 m east so the Yarra centreline falls inside the 1 km frame (still same neighbourhood).
const queryCircle = "?lat=-37.8270&lon=145.0040&km=1&shape=circle";
const querySquare = "?lat=-37.8270&lon=145.0040&km=1";

async function waitForModel(page) {
  await page.getByRole("heading", { name: /Your model is ready/i }).waitFor({ timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const dts = [...document.querySelectorAll(".stats dt")];
      const dds = [...document.querySelectorAll(".stats dd")];
      const index = dts.findIndex((dt) => dt.textContent?.includes("Buildings"));
      if (index < 0) return false;
      const count = Number.parseInt((dds[index]?.textContent ?? "0").replace(/,/g, ""), 10);
      return count > 20;
    },
    { timeout: 180_000 },
  );
}

async function enableAxoLayers(page) {
  await page.getByRole("button", { name: "Drawing" }).click();
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("button", { name: "Exploded axo" }).click();
  const labels = ["PLANNING", "HYDRO", "TRANSPORT", "TOPOGRAPHY"];
  for (const label of labels) {
    const checkbox = page.locator(".axo-layer-list label.check-field").filter({ hasText: label }).locator("input");
    if (await checkbox.count()) {
      if (!(await checkbox.isChecked())) await checkbox.check();
    }
  }
  await page.getByRole("button", { name: "Fit frame" }).click();
  await page.waitForTimeout(4000);
  await page.waitForFunction(
    () => document.querySelectorAll("svg.plan.exploded-axo path[fill], svg.plan.exploded-axo path[stroke]").length > 20,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelectorAll('svg.plan.exploded-axo path[stroke="#3d8fbf"], svg.plan.exploded-axo path[fill="#6eb5d9"], svg.plan.exploded-axo path[fill="#7eb8da"]').length > 0,
    { timeout: 120_000 },
  ).catch(() => {});
  await page.waitForFunction(
    () =>
      document.querySelectorAll('svg.plan.exploded-axo path[stroke="#00854a"], svg.plan.exploded-axo path[stroke="#c45c00"]').length > 0,
    { timeout: 120_000 },
  ).catch(() => {});
  await page.waitForTimeout(2000);
}

async function capture(query, pngPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await waitForModel(page);
  await enableAxoLayers(page);
  await page.locator("svg.plan.exploded-axo").screenshot({ path: pngPath });
  await browser.close();
  console.log("saved", pngPath);
}

async function exportPdf() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${base}${queryCircle}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await waitForModel(page);
  await enableAxoLayers(page);
  await page.getByRole("button", { name: "Exports" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByRole("button", { name: /Download exploded axo/i }).click();
  const download = await downloadPromise;
  const pdfPath = "/opt/cursor/artifacts/exploded-axo-richmond-circle-1km.pdf";
  await download.saveAs(pdfPath);
  await browser.close();
  execSync(
    `pdftoppm -png -singlefile -r 150 ${pdfPath} /opt/cursor/artifacts/exploded-axo-richmond-circle-1km-pdftoppm`,
  );
  console.log("saved pdf render");
}

await capture(queryCircle, "/opt/cursor/artifacts/exploded-axo-richmond-circle-1km.png");
await capture(querySquare, "/opt/cursor/artifacts/exploded-axo-richmond-square-1km.png");
await exportPdf();

for (const file of [
  "/opt/cursor/artifacts/exploded-axo-richmond-circle-1km.png",
  "/opt/cursor/artifacts/exploded-axo-richmond-square-1km.png",
  "/opt/cursor/artifacts/exploded-axo-richmond-circle-1km.pdf",
  "/opt/cursor/artifacts/exploded-axo-richmond-circle-1km-pdftoppm.png",
]) {
  if (!existsSync(file)) throw new Error(`missing artifact ${file}`);
}
