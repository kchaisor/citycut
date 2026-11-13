import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const url =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const width = Number(process.env.WIDTH ?? 1440);
const height = Number(process.env.HEIGHT ?? 800);
const CLIP_W = 240;
const CLIP_H = 160;
const DARK = { r: 74, g: 79, b: 87 };
const DARK_TOL = 14;
const RADIUS = 40;

function countDarkNearCentre(pngPath, cx, cy) {
  const data = readFileSync(pngPath);
  const png = PNG.sync.read(data);
  let count = 0;
  const r2 = RADIUS * RADIUS;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (png.width * y + x) * 4;
      const pr = png.data[i];
      const pg = png.data[i + 1];
      const pb = png.data[i + 2];
      const pa = png.data[i + 3];
      if (pa < 64) continue;
      if (
        Math.abs(pr - DARK.r) <= DARK_TOL &&
        Math.abs(pg - DARK.g) <= DARK_TOL &&
        Math.abs(pb - DARK.b) <= DARK_TOL
      ) {
        count++;
      }
    }
  }
  return count;
}

async function deckEndClip(page, side) {
  return page.evaluate(
    ({ sideName, clipW, clipH, viewW, viewH }) => {
      const caps = [...document.querySelectorAll('path[data-deck-stroke="cap"]')];
      if (caps.length === 0) return null;
      const sorted = caps.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return sideName === "west" ? ra.left - rb.left : rb.right - ra.right;
      });
      const el = sorted[0];
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const x = Math.max(0, Math.round(cx - clipW / 2));
      const y = Math.max(0, Math.round(cy - clipH / 2));
      return {
        x,
        y,
        width: Math.min(viewW - x, clipW),
        height: Math.min(viewH - y, clipH),
        stroke: getComputedStyle(el).stroke,
        centreX: cx - x,
        centreY: cy - y,
      };
    },
    { sideName: side, clipW: CLIP_W, clipH: CLIP_H, viewW: width, viewH: height },
  );
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(360_000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("button.create-fab").click({ timeout: 60_000 });
  await page.waitForSelector(".model", { timeout: 360_000 });
  await page.waitForFunction(
    () => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return true;
      const opacity = Number(getComputedStyle(pill).opacity);
      return getComputedStyle(pill).display === "none" || opacity <= 0.05;
    },
    { timeout: 360_000 },
  );
  await page.getByRole("tab", { name: /Drawing/i }).click({ timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelectorAll('path[data-deck-stroke="cap"]').length > 0,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(800);

  const domSummary = await page.evaluate(() => {
    const caps = [...document.querySelectorAll('path[data-deck-stroke="cap"]')].map((el) => ({
      stroke: getComputedStyle(el).stroke,
      d: el.getAttribute("d"),
    }));
    const rails = [...document.querySelectorAll('path[data-deck-stroke="rail"]')].map((el) => ({
      stroke: getComputedStyle(el).stroke,
      d: el.getAttribute("d"),
    }));
    return { caps, rails };
  });
  console.log(JSON.stringify(domSummary));

  for (const side of ["west", "east"]) {
    const info = await deckEndClip(page, side);
    if (!info) throw new Error(`No deck ${side} cap path`);
    const out = path.join(OUT_DIR, `rozelle-pr227-deck-${side}-end-${width}.png`);
    await page.screenshot({ path: out, clip: { x: info.x, y: info.y, width: info.width, height: info.height } });
    const railStrokeHits = await page.evaluate(
      ({ cx, cy, radius, clipX, clipY }) => {
        const svg = document.querySelector("svg.plan");
        if (!svg) return 0;
        const matrix = svg.getScreenCTM();
        if (!matrix) return 0;
        let hits = 0;
        for (const path of document.querySelectorAll('path[data-deck-stroke="rail"]')) {
          const stroke = getComputedStyle(path).stroke;
          if (stroke !== "rgb(74, 79, 87)") continue;
          const len = path.getTotalLength();
          for (let d = 0; d <= len; d += 1.5) {
            const p = path.getPointAtLength(d);
            const pt = new DOMPoint(p.x, p.y).matrixTransform(matrix);
            const dx = pt.x - (clipX + cx);
            const dy = pt.y - (clipY + cy);
            if (dx * dx + dy * dy <= radius * radius) hits++;
          }
        }
        return hits;
      },
      { cx: info.centreX, cy: info.centreY, radius: RADIUS, clipX: info.x, clipY: info.y },
    );
    const darkCount = countDarkNearCentre(out, info.centreX, info.centreY);
    console.log(
      out,
      info.stroke,
      `darkStructurePixelsWithin40=${darkCount}`,
      `deckRailStrokeSamplesWithin40=${railStrokeHits}`,
    );
    if (!/rgb\(141,\s*137,\s*131\)|#8d8983/i.test(info.stroke)) {
      throw new Error(`Deck ${side} cap stroke not kerb colour: ${info.stroke}`);
    }
    if (railStrokeHits > 0) {
      throw new Error(`Deck ${side} end still has ${railStrokeHits} deck-rail stroke samples near centre`);
    }
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
