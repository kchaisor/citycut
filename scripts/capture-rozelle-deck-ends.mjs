import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const url =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const width = Number(process.env.WIDTH ?? 1280);

async function clipFromCaps(page, side) {
  return page.evaluate((sideName) => {
    const caps = [...document.querySelectorAll('path[data-deck-stroke="cap"]')];
    if (caps.length === 0) return null;
    const sorted = caps.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return sideName === "west" ? ra.left - rb.left : rb.right - ra.right;
    });
    const el = sorted[0];
    const r = el.getBoundingClientRect();
    const base = Math.max(r.width, r.height, 48) * 1.6;
    const size = base * 3;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const x = Math.max(0, Math.round(cx - size / 2));
    const y = Math.max(0, Math.round(cy - size / 2));
    const stroke = getComputedStyle(el).stroke;
    return {
      x,
      y,
      width: Math.min(window.innerWidth - x, Math.round(size)),
      height: Math.min(window.innerHeight - y, Math.round(size)),
      stroke,
    };
  }, side);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width, height: 800 } });
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
  await page.waitForSelector('path[data-deck-stroke="cap"]', { timeout: 120_000 });
  await page.waitForTimeout(600);

  const domSummary = await page.evaluate(() => {
    const caps = [...document.querySelectorAll('path[data-deck-stroke="cap"]')].map((el) => ({
      stroke: getComputedStyle(el).stroke,
      d: el.getAttribute("d"),
    }));
    const rails = [...document.querySelectorAll('path[data-deck-stroke="rail"]')].length;
    return { caps, rails };
  });
  console.log(JSON.stringify(domSummary));

  for (const side of ["west", "east"]) {
    const info = await clipFromCaps(page, side);
    if (!info) throw new Error(`No deck ${side} cap path`);
    const out = path.join(OUT_DIR, `rozelle-pr227-deck-${side}-cap-${width}.png`);
    await page.screenshot({ path: out, clip: info });
    console.log(out, info.stroke);
    if (!/rgb\(141,\s*137,\s*131\)|#8d8983/i.test(info.stroke)) {
      throw new Error(`Deck ${side} cap stroke not kerb colour: ${info.stroke}`);
    }
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
