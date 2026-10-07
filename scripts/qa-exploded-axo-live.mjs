import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.env.QA_BASE ?? "http://localhost:4173/citycut/";

async function waitForModel(page) {
  await page.getByRole("heading", { name: /Your model is ready/i }).waitFor({ timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const dts = [...document.querySelectorAll(".stats dt")];
      const dds = [...document.querySelectorAll(".stats dd")];
      const index = dts.findIndex((dt) => dt.textContent?.includes("Buildings"));
      if (index < 0) return false;
      const count = Number.parseInt((dds[index]?.textContent ?? "0").replace(/,/g, ""), 10);
      return count > 50;
    },
    { timeout: 120_000 },
  );
}

async function openExplodedAxo(page) {
  await page.getByRole("button", { name: "Drawing" }).click();
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("button", { name: "Exploded axo" }).click();
  await page.locator("svg.plan.exploded-axo").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Fit frame" }).click();
  await page.waitForTimeout(4000);
  await page.waitForFunction(
    () => {
      const paths = document.querySelectorAll("svg.plan.exploded-axo path[fill]");
      return paths.length >= 8;
    },
    { timeout: 60_000 },
  );
}

async function capture(shape, pngPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const query =
    shape === "circle"
      ? "?lat=-37.8136&lon=144.9631&km=0.5&shape=circle"
      : "?lat=-37.8136&lon=144.9631&km=0.5";
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await waitForModel(page);
  await openExplodedAxo(page);
  await page.locator(".fill.is-plan").screenshot({ path: pngPath });
  await browser.close();
  console.log("saved", pngPath);
}

async function exportPdf(pngPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}?lat=-37.8136&lon=144.9631&km=0.5`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: /Create model/i }).click();
  await waitForModel(page);
  await page.getByRole("button", { name: "Exports" }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByRole("button", { name: /Download exploded axo/i }).click();
  const download = await downloadPromise;
  const pdfPath = "/opt/cursor/artifacts/exploded-axo-melbourne.pdf";
  await download.saveAs(pdfPath);
  await browser.close();
  execSync(
    `pdftoppm -png -singlefile -r 150 ${pdfPath} /opt/cursor/artifacts/exploded-axo-melbourne-pdftoppm`,
  );
  console.log("saved", pdfPath, pngPath.replace(".png", "-check.png"));
}

await capture("square", "/opt/cursor/artifacts/exploded-axo-square-0.5km.png");
await capture("circle", "/opt/cursor/artifacts/exploded-axo-circle-0.5km.png");
await exportPdf("/opt/cursor/artifacts/exploded-axo-melbourne-pdftoppm.png");

for (const file of [
  "/opt/cursor/artifacts/exploded-axo-square-0.5km.png",
  "/opt/cursor/artifacts/exploded-axo-circle-0.5km.png",
  "/opt/cursor/artifacts/exploded-axo-melbourne.pdf",
  "/opt/cursor/artifacts/exploded-axo-melbourne-pdftoppm.png",
]) {
  if (!existsSync(file)) throw new Error(`missing artifact ${file}`);
}
