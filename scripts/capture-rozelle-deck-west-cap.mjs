import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "/opt/cursor/artifacts/rozelle-pr227-deck-west-cap-1280.png";
mkdirSync(path.dirname(OUT), { recursive: true });

const url =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(360_000);
await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.locator("button.create-fab").click({ timeout: 30_000 });
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
await page.waitForSelector("svg.plan", { timeout: 120_000 });
await page.waitForTimeout(800);
const clip = await page.evaluate(() => {
  const cap = document.querySelector('path[data-deck-stroke="cap"]');
  const west =
    cap ??
  Array.from(document.querySelectorAll('path[data-stored-structure="true"]'))
      .sort((a, b) => a.getBBox().x - b.getBBox().x)[0];
  if (!west) return null;
  const r = west.getBoundingClientRect();
  const base = Math.max(r.width, r.height, 48) * 1.6;
  const size = base * 3;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const x = Math.max(0, Math.round(cx - size / 2));
  const y = Math.max(0, Math.round(cy - size / 2));
  const width = Math.min(window.innerWidth - x, Math.round(size));
  const height = Math.min(window.innerHeight - y, Math.round(size));
  return { x, y, width, height };
});
if (!clip) throw new Error("Deck west cap path not found");
await page.screenshot({ path: OUT, clip });
await browser.close();
console.log(OUT);
