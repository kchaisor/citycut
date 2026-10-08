import { chromium } from "playwright";
import fs from "node:fs";

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const query = "?lat=-37.8127&lon=144.98061&km=1&qa=1";
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("/cursor/stores/self/artifacts", { recursive: true });

async function waitLandingColour(page) {
  await page.waitForFunction(
    () => window.__citycutCutColourStats?.layerRebuilds >= 1,
    undefined,
    { timeout: 120_000 },
  ).catch(() => {});
  await page.waitForTimeout(2000);
}

async function captureLanding(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}${query}`, { waitUntil: "networkidle", timeout: 120_000 });
  await waitLandingColour(page);
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, fullPage: false });
  await page.close();
  return path;
}

async function waitCanvasPainted(page) {
  await page.locator(".viewport canvas").waitFor({ state: "visible", timeout: 300_000 });
  await page
    .waitForFunction(
      () => window.__citycutQaModel?.getHeightPerfTimings?.()?.firstRenderMs != null,
      undefined,
      { timeout: 120_000 },
    )
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".viewport canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const sample = ctx.getImageData(0, 0, 8, 8).data;
        return sample.some((v, i) => i % 4 !== 3 && v !== sample[0]);
      }
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return false;
      const buf = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const grey = buf[0] === buf[1] && buf[1] === buf[2];
      return !grey || buf[0] < 240;
    },
    undefined,
    { timeout: 90_000 },
  ).catch(() => {});
  await page.waitForTimeout(6000);
}

async function captureModel(browser, name, { drawing = false, blocks3d = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  if (drawing) {
    await page.getByRole("button", { name: "Drawing", exact: true }).click();
    await page.getByRole("button", { name: "Site plan", exact: true }).click();
    await page.waitForSelector("svg.plan path", { timeout: 120_000 });
    await page.waitForTimeout(2000);
  } else {
    await waitCanvasPainted(page);
    if (blocks3d) {
      const layers = page.getByRole("button", { name: "Layers", exact: true });
      if (await layers.count()) {
        await layers.click();
        const blocksRow = page.locator(".layers li").filter({ hasText: "Blocks" });
        if (await blocksRow.count()) {
          const toggle = blocksRow.locator("button.toggle");
          const pressed = await toggle.getAttribute("aria-pressed");
          if (pressed !== "true") await toggle.click();
        }
        await page.waitForTimeout(2000);
      }
      await page.getByRole("button", { name: "Isometric", exact: true }).click().catch(() => {});
      await waitCanvasPainted(page);
      console.log("3D summary", await page.evaluate(() => window.__citycutQaModel?.getSummary?.() ?? null));
    }
  }
  const path = `${outDir}/${name}`;
  const target = drawing ? page.locator("svg.plan") : page.locator(".viewport canvas");
  await target.screenshot({ path });
  await page.close();
  return path;
}

const browser = await chromium.launch({ headless: true, args: SWIFT });

const shots = [
  await captureLanding(browser, "east-melbourne-landing-use-colour.png"),
  await captureModel(browser, "east-melbourne-site-plan-blocks-pr.png", { drawing: true }),
  await captureModel(browser, "east-melbourne-3d-blocks-pr.png", { blocks3d: true }),
];

await browser.close();

for (const path of shots) {
  const dest = `/cursor/stores/self/artifacts/${path.split("/").pop()}`;
  fs.copyFileSync(path, dest);
  console.log("Saved", path);
}
