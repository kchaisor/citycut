import { chromium } from "playwright";
import fs from "node:fs";

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

const VIEWPORT = { width: 1280, height: 800 };
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const query = "?lat=-37.8127&lon=144.98061&km=1&qa=1";
const outDir = "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync("/cursor/stores/self/artifacts", { recursive: true });

async function waitLandingColour(page) {
  await page
    .waitForFunction(
      () => window.__citycutCutColourStats?.colourFillMs != null,
      undefined,
      { timeout: 120_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function captureLanding(browser, name) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitLandingColour(page);
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, fullPage: false });
  await page.close();
  return path;
}

async function waitModelReady(page) {
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  await page
    .waitForFunction(
      () => window.__citycutQaModel?.getHeightPerfTimings?.()?.firstRenderMs != null,
      undefined,
      { timeout: 120_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(3000);
}

async function capturePlan(browser, name) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitModelReady(page);
  await page.getByRole("button", { name: "Drawing", exact: true }).click();
  await page.getByRole("button", { name: "Site plan", exact: true }).click();
  await page.waitForSelector("svg.plan path", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, fullPage: false });
  await page.close();
  return path;
}

async function capture3d(browser, name) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitModelReady(page);
  const layers = page.getByRole("button", { name: "Layers", exact: true });
  if (await layers.count()) {
    await layers.click();
    const blocksRow = page.locator(".layers li").filter({ hasText: "Blocks" });
    if (await blocksRow.count()) {
      const toggle = blocksRow.locator("button.toggle");
      if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
    }
    await page.waitForTimeout(1500);
  }
  await page.getByRole("button", { name: "Isometric", exact: true }).click().catch(() => {});
  await page.waitForTimeout(4000);
  const summary = await page.evaluate(() => window.__citycutQaModel?.getSummary?.() ?? null);
  console.log("3D summary", summary);

  const path = `${outDir}/${name}`;
  let painted = false;

  const b64 = await page.evaluate(async () => {
    const fn = window.__citycutQaModel?.captureViewportPng;
    if (!fn) return null;
    return fn();
  });
  if (b64) {
    fs.writeFileSync(path, Buffer.from(b64, "base64"));
    painted = true;
  }

  if (!painted) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(path, Buffer.from(shot.data, "base64"));
    const sample = await page.evaluate(() => {
      const canvas = document.querySelector(".viewport canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return { ok: false };
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return { ok: false };
      const buf = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buf,
      );
      return { ok: true, buf: [...buf] };
    });
    painted = sample.ok && (sample.buf[0] < 250 || sample.buf[0] !== sample.buf[1]);
  }

  if (!painted) {
    console.warn("3D viewport did not paint in headless SwiftShader; screenshot may be blank.");
  }

  await page.close();
  return { path, painted };
}

const browser = await chromium.launch({ headless: true, args: SWIFT });

const shots = [
  await captureLanding(browser, "east-melbourne-landing-use-colour.png"),
  await capturePlan(browser, "east-melbourne-site-plan-blocks-pr.png"),
  (await capture3d(browser, "east-melbourne-3d-blocks-pr.png")).path,
];

await browser.close();

for (const path of shots) {
  const dest = `/cursor/stores/self/artifacts/${path.split("/").pop()}`;
  fs.copyFileSync(path, dest);
  console.log("Saved", path);
}
