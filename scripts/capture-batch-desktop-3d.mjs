import { chromium } from "playwright";
import fs from "node:fs";

const out = "/opt/cursor/artifacts/batch-desktop-3d.png";
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const url = "http://127.0.0.1:5173/citycut-export/?lat=-37.8136&lon=144.9631&km=0.45";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(180_000);

await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Layers", exact: true }).click();
await page.waitForSelector(".drawer-section:not([hidden]) input[type=range]");

async function setLayer(label, on) {
  const row = page.locator(".layers li").filter({ hasText: label });
  const toggle = row.locator("button.toggle");
  const pressed = await toggle.getAttribute("aria-pressed");
  if ((pressed === "true") !== on) await toggle.click();
}

await setLayer("Roads and rail", false);
await setLayer("Water and green", false);
await setLayer("Buildings", true);
await setLayer("Trees", true);
await setLayer("Terrain", false);

async function modelReady() {
  return page.locator(".model-chrome").isVisible();
}

async function waitForCreateFab() {
  await page.waitForFunction(
    () => {
      const fab = document.querySelector("button.create-fab");
      return fab instanceof HTMLButtonElement && !fab.disabled;
    },
    null,
    { timeout: 180_000 },
  );
}

let opened = false;
for (let attempt = 0; attempt < 15 && !opened; attempt++) {
  if (await modelReady()) {
    opened = true;
    break;
  }
  await waitForCreateFab();
  await page.locator("button.create-fab").click();
  try {
    await page.waitForSelector(".model-chrome", { state: "visible", timeout: 120_000 });
    opened = true;
  } catch {
    const err = await page.locator(".error, .stage-error").first().textContent().catch(() => null);
    console.error(`attempt ${attempt + 1}: ${err ?? "model chrome not ready"}`);
  }
}
if (!opened) throw new Error("Could not open model");

await page.locator(".viewport canvas").waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`wrote ${out}`);
