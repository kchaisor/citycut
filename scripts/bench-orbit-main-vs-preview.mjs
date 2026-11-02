import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const CHROME_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--no-sandbox",
];

const SITE = { lat: -37.8136, lon: 144.9831, km: 1, label: "East Melbourne" };
const MAIN_URL = (process.env.CITYCUT_MAIN_URL ?? "https://citycut-app.vercel.app/").replace(/\/?$/, "/");
const BRANCH_URL = (
  process.env.CITYCUT_PREVIEW_URL ??
  process.env.VERIFY_BASE_URL ??
  "https://citycut-git-feat-hover-b85-white-palette-kchai.vercel.app/"
).replace(/\/?$/, "/");

function modelUrl(base) {
  const u = new URL(base);
  u.searchParams.set("qa", "1");
  u.searchParams.set("view", "persp");
  u.searchParams.set("lat", String(SITE.lat));
  u.searchParams.set("lon", String(SITE.lon));
  u.searchParams.set("km", String(SITE.km));
  u.searchParams.set("label", SITE.label);
  return u.toString();
}

async function waitIntroDone(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.addEventListener("citycut:intro-done", done, { once: true });
        function done() {
          resolve(undefined);
        }
        setTimeout(done, 45000);
      }),
  );
}

async function waitForWebGlCanvas(page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return Boolean(canvas && canvas.width > 800 && canvas.height > 500);
    },
    { timeout: 180000 },
  );
}

async function settleDefaultCamera(page) {
  const reset = page.getByRole("button", { name: "Reset view" });
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
}

async function openModel(page, baseUrl) {
  await page.addInitScript(() => {
    window.localStorage.setItem("citycut.view3d.quality", "high");
    window.__citycutMinSilentLoadMs = 0;
    window.__citycutPerfOverrides = null;
    try {
      window.localStorage.setItem(
        "citycut.view",
        JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
      );
    } catch {
    }
  });
  await page.goto(modelUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model", { timeout: 600000 });
  await waitForWebGlCanvas(page);
  await waitIntroDone(page);
  await settleDefaultCamera(page);
  const highBtn = page.getByRole("button", { name: "High", exact: true });
  if (await highBtn.count()) await highBtn.click();
  await page.waitForTimeout(400);
}

async function gpuInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".model canvas") ?? document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return { renderer: "none", swiftShader: true };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { renderer: String(renderer), swiftShader: /swiftshader/i.test(String(renderer)) };
  });
}

async function mouseDragPerfSample(page, durationMs) {
  const canvas = page.locator(".model canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.48;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const hasPerf = await page.evaluate(() => Boolean(window.__citycutPerf?.startSample));
  if (hasPerf) {
    await page.evaluate((ms) => window.__citycutPerf.startSample({ durationMs: ms, orbit: false }), durationMs + 2500);
  }
  const steps = Math.max(28, Math.round(durationMs / 70));
  const dx = (box.width * 0.32) / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx + dx * (i + 1), cy + Math.sin(i / 4) * 4, { steps: 2 });
    await page.waitForTimeout(65);
  }
  await page.mouse.up();
  await page.waitForTimeout(250);
  let perfStats = null;
  if (hasPerf) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(32);
      perfStats = await page.evaluate(() => window.__citycutPerf?.readSample?.() ?? null);
      if (perfStats) break;
    }
  }
  return perfStats;
}

async function measureTarget(target) {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: CHROME_ARGS,
  });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    await openModel(page, target.url);
    const gpu = await gpuInfo(page);
    const orbit = await mouseDragPerfSample(page, 4000);
    const pan = await mouseDragPerfSample(page, 3000);
    const pick = (stats) =>
      stats
        ? {
            drawCallsPeak: stats.drawCallsPeak,
            trianglesPeak: stats.trianglesPeak,
            linesPeak: stats.linesPeak,
            ...(gpu.swiftShader
              ? { frameMsNote: "SwiftShader: frame ms omitted" }
              : {
                  frameMsP50: stats.frameMsP50,
                  frameMsP95: stats.frameMsP95,
                }),
          }
        : null;
    return {
      id: target.id,
      url: target.url,
      gpu,
      orbit: pick(orbit),
      pan: pick(pan),
    };
  } finally {
    await browser.close();
  }
}

const targets = [
  { id: "main", url: MAIN_URL },
  { id: "branch", url: BRANCH_URL },
];

const results = [];
for (const target of targets) {
  results.push(await measureTarget(target));
}
console.log(JSON.stringify({ site: SITE, results }, null, 2));
