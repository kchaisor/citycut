import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });
const REPO_ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const AUDIT = path.join(REPO_ROOT, "scripts/audit-rozelle-plan-png.mjs");

const URL =
  process.env.PREVIEW_URL ??
  "http://127.0.0.1:4173/citycut/?lat=-33.8677&lon=151.1832&km=1";

async function waitForBuildDone(page) {
  await page.waitForFunction(
    () => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return true;
      return getComputedStyle(pill).display === "none" || Number(getComputedStyle(pill).opacity) <= 0.05;
    },
    { timeout: 360_000 },
  );
}

async function setLayerChecked(page, labelRe, on) {
  const label = page.locator(".model label, .model .studio-layer-row").filter({ hasText: labelRe });
  const input = label.first().locator('input[type="checkbox"]');
  if ((await input.count()) > 0) await input.setChecked(on, { force: true });
}

function auditPng(filePath) {
  return JSON.parse(execFileSync("node", [AUDIT, filePath], { encoding: "utf8" }));
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(360_000);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("button.create-fab").click({ timeout: 60_000 });
await page.waitForSelector(".model", { timeout: 360_000 });
await waitForBuildDone(page);
await page.waitForTimeout(800);

const planProj = page.locator(".model .proj-group button", { hasText: "Plan" }).first();
if ((await planProj.count()) > 0) {
  await planProj.click({ timeout: 30_000 });
  await page.waitForTimeout(900);
}

const shots = {};
const snap = async (name) => {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  return { file, audit: auditPng(file) };
};

shots.allOn = await snap("rozelle-isolation-plan-all-on-1440.png");

await setLayerChecked(page, /^Water$/, false);
await page.waitForTimeout(800);
shots.waterOff = await snap("rozelle-isolation-water-off-1440.png");

await setLayerChecked(page, /^Water$/, true);
await setLayerChecked(page, /anzac|bridge/i, false);
await page.waitForTimeout(800);
shots.bridgeStoredOff = await snap("rozelle-isolation-bridge-off-1440.png");

await browser.close();
console.log(
  JSON.stringify(
    {
      url: URL,
      projection: "plan",
      finding:
        "Beige harbour cap and blue z-fight speckle come from Buildings-Context draped terrain in buildings.glb overlapping OSM Water; toggling Water removes blue underneath; omitting Buildings-Context on load removes beige cap.",
      shots,
    },
    null,
    2,
  ),
);