import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const CANONICAL =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const WIDTHS = [1280, 1440];

async function overlapSample(page, gapPx = 8) {
  return page.evaluate((gap) => {
    const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
    const cards = [
      ...document.querySelectorAll(".model .studio-header-center"),
      ...document.querySelectorAll(".model .studio-header-right"),
      ...document.querySelectorAll(".model .right-inspector"),
      ...document.querySelectorAll(".select .hud-card"),
      ...document.querySelectorAll(".select .omnibox-stack"),
    ];
    if (!pill) return { phase: "no-pill", overlap: false };
    const pillStyle = getComputedStyle(pill);
    if (pillStyle.display === "none" || Number(pillStyle.opacity) <= 0.05) {
      return { phase: "pill-hidden", overlap: false };
    }
    const p = pill.getBoundingClientRect();
    for (const card of cards) {
      const cardStyle = getComputedStyle(card);
      if (cardStyle.visibility === "hidden" || Number(cardStyle.opacity) <= 0.05) continue;
      const c = card.getBoundingClientRect();
      if (c.width <= 0 || c.height <= 0) continue;
      const hits =
        !(p.right < c.left || p.left > c.right || p.bottom < c.top || p.top > c.bottom) &&
        !(p.top >= c.bottom + gap);
      if (hits) {
        return {
          phase: "overlap",
          overlap: true,
          pillPct: pill.dataset.progressPct ?? null,
          pill,
          card: { className: card.className, ...c },
        };
      }
    }
    const pct = pill.dataset.progressPct ?? null;
    return { phase: pct !== null ? `pct-${pct}` : "pill-visible", overlap: false, pillPct: pct };
  }, gapPx);
}

async function pollPillLayout(page, label, samples) {
  const sample = await overlapSample(page);
  samples.push({ at: label, ...sample });
  if (sample.overlap) {
    throw new Error(`Bridge pill overlaps HUD at ${label}: ${JSON.stringify(sample)}`);
  }
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

async function captureAtWidth(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(360_000);
  const layoutSamples = [];
  await page.goto(CANONICAL, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector(".select .frame", { timeout: 60_000 });
  await pollPillLayout(page, "before-create", layoutSamples);
  const createClickAt = Date.now();
  await page.locator("button.create-fab").click({ timeout: 30_000 });
  await pollPillLayout(page, "just-after-create", layoutSamples);
  await page.waitForSelector(".model", { timeout: 360_000 });
  await pollPillLayout(page, "model-mounted", layoutSamples);

  const deadline = Date.now() + 120_000;
  let sawMid = false;
  while (Date.now() < deadline) {
    await pollPillLayout(page, `poll-${Date.now() - createClickAt}ms`, layoutSamples);
    const meta = await page.evaluate(() => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return { visible: false, pct: null };
      const style = getComputedStyle(pill);
      const visible = style.display !== "none" && Number(style.opacity) > 0.05;
      return { visible, pct: Number(pill.dataset.progressPct ?? 0) };
    });
    if (meta.visible && meta.pct >= 3 && meta.pct <= 12) {
      await pollPillLayout(page, "early-fetch-5pct", layoutSamples);
      await page.screenshot({
        path: path.join(OUT_DIR, `rozelle-pr227-pill-early-${width}.png`),
        fullPage: false,
      });
    }
    if (meta.visible && meta.pct >= 40 && meta.pct <= 60 && !sawMid) {
      sawMid = true;
      await pollPillLayout(page, "mid-build", layoutSamples);
    }
    if (!meta.visible) break;
    await page.waitForTimeout(350);
  }

  await waitForBuildDone(page);
  await page.waitForTimeout(1500);
  await pollPillLayout(page, "after-build", layoutSamples);

  const shot3d = path.join(OUT_DIR, `rozelle-pr227-3d-${width}.png`);
  await page.screenshot({ path: shot3d, fullPage: false });

  await page.getByRole("tab", { name: /Drawing/i }).click({ timeout: 120_000 });
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(1200);

  const shotDrawing = path.join(OUT_DIR, `rozelle-pr227-drawing-${width}.png`);
  await page.screenshot({ path: shotDrawing, fullPage: false });

  await page.close();
  return { shot3d, shotDrawing, layoutSamples };
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
