import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const CANONICAL =
  process.env.PREVIEW_URL ??
  "https://citycut-5nhxp7flv-kchai.vercel.app/citycut/?lat=-33.8677&lon=151.1832&km=1";

const WIDTHS = [1280, 1440];

function rectsIntersect(a, b, gapPx) {
  if (a.right <= a.left || a.bottom <= a.top) return false;
  if (b.right <= b.left || b.bottom <= b.top) return false;
  if (a.top >= b.bottom + gapPx) return false;
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

async function waitForBuildDone(page) {
  await page.waitForFunction(
    () => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return true;
      const opacity = Number(getComputedStyle(pill).opacity);
      const display = getComputedStyle(pill).display;
      return display === "none" || opacity <= 0.05;
    },
    { timeout: 360_000 },
  );
}

async function assertPillLayoutWhileVisible(page) {
  const bad = await page.evaluate((gapPx) => {
    const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
    const card = document.querySelector(".model .studio-header-center");
    if (!pill || !card) return null;
    const pillStyle = getComputedStyle(pill);
    if (pillStyle.display === "none" || Number(pillStyle.opacity) <= 0.05) return null;
    const cardStyle = getComputedStyle(card);
    if (cardStyle.visibility === "hidden" || Number(cardStyle.opacity) <= 0.05) return null;
    const p = pill.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const hits =
      !(p.right < c.left || p.left > c.right || p.bottom < c.top || p.top > c.bottom) &&
      !(p.top >= c.bottom + gapPx);
    return hits ? { pill: { ...p }, card: { ...c } } : null;
  }, 8);
  if (bad) {
    throw new Error(`Bridge pill overlaps header card: ${JSON.stringify(bad)}`);
  }
}

async function captureAtWidth(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(360_000);
  await page.goto(CANONICAL, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".select .frame", { timeout: 60_000 });
  await page.locator("button.create-fab").click({ timeout: 30_000 });
  await page.waitForSelector(".model", { timeout: 360_000 });

  const pollEnd = Date.now() + 120_000;
  while (Date.now() < pollEnd) {
    await assertPillLayoutWhileVisible(page);
    const pillVisible = await page.evaluate(() => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return false;
      const style = getComputedStyle(pill);
      return style.display !== "none" && Number(style.opacity) > 0.05;
    });
    if (!pillVisible) break;
    await page.waitForTimeout(400);
  }

  await waitForBuildDone(page);
  await page.waitForTimeout(1500);

  const shot3d = path.join(OUT_DIR, `rozelle-pr227-3d-${width}.png`);
  await page.screenshot({ path: shot3d, fullPage: false });

  await page.getByRole("tab", { name: /Drawing/i }).click({ timeout: 120_000 });
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(1200);

  const shotDrawing = path.join(OUT_DIR, `rozelle-pr227-drawing-${width}.png`);
  await page.screenshot({ path: shotDrawing, fullPage: false });

  await page.close();
  return { shot3d, shotDrawing };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const manifest = { canonicalUrl: CANONICAL, widths: WIDTHS, shots: [] };
for (const width of WIDTHS) {
  const pair = await captureAtWidth(browser, width);
  manifest.shots.push({ width, ...pair });
}

await browser.close();
writeFileSync(path.join(OUT_DIR, "rozelle-pr227-artifacts.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
