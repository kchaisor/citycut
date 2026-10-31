import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PREVIEW_BASE = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-anchored-lens-kchai.vercel.app/";
const SHARE = process.env.CITYCUT_PREVIEW_SHARE ?? "";
const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };

function previewUrl() {
  const u = new URL(PREVIEW_BASE);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", "-37.8136");
  u.searchParams.set("lon", "144.9831");
  u.searchParams.set("km", "1");
  if (SHARE) u.searchParams.set("_vercel_share", SHARE.replace(/^_vercel_share=/, ""));
  return u.toString();
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
  } catch {
    // ignore
  }
});
const page = await context.newPage();
await page.goto(previewUrl(), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.click("button.create-fab");
await page.waitForFunction(() => Boolean(window.__citycutQaModel?.findTallBuildingForLensQa), { timeout: 180000 });
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(1500);

const target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!target) throw new Error("No lens target");
const pair = await page.evaluate(() => window.__citycutQaModel?.findLensHoverPairQa?.() ?? null);
const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No canvas");

await page.mouse.move(canvasBox.x + canvasBox.width * 0.15, canvasBox.y + canvasBox.height * 0.9);
await page.waitForTimeout(300);

if (pair) {
  await page.mouse.move(pair.a.clickX, pair.a.clickY);
  await page.waitForTimeout(350);
  await page.mouse.move(pair.b.clickX, pair.b.clickY, { steps: 8 });
} else {
  await page.mouse.move(target.clickX, target.clickY);
}
await page.waitForFunction(
  () => {
    const layout = window.__citycutQaModel?.getAnchoredLensLayout?.() ?? null;
    return window.__citycutQaModel?.getAnchoredLensMode?.() === "hover" && layout?.onScreen === true;
  },
  { timeout: 10000 },
);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "anchored-lens-hover.png") });

let pinClick = await page.evaluate(
  (id) => window.__citycutQaModel?.resolveLensBuildingClick?.(id) ?? null,
  target.id,
);
if (!pinClick) {
  const again = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
  if (again) pinClick = { clickX: again.clickX, clickY: again.clickY };
}
if (!pinClick) throw new Error("No pin click coords");
await page.mouse.move(pinClick.clickX, pinClick.clickY, { steps: 4 });
await page.waitForTimeout(350);
await page.mouse.click(pinClick.clickX, pinClick.clickY);
const pinnedReady = async () => {
  await page.waitForFunction(
    () => {
      const layout = window.__citycutQaModel?.getAnchoredLensLayout?.() ?? null;
      return (
        window.__citycutQaModel?.getAnchoredLensMode?.() === "pinned" &&
        layout?.onScreen === true &&
        Boolean(document.querySelector('[data-anchored-lens-action="cut"]'))
      );
    },
    { timeout: 8000 },
  );
};
try {
  await pinnedReady();
} catch {
  await page.evaluate((id) => window.__citycutQaModel?.openAnchoredLensForBuilding?.(id), target.id);
  await pinnedReady();
}
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "anchored-lens-pinned.png") });

const framesDir = "/tmp/anchored_lens_hover_video_frames";
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
let fi = 0;
const snap = async () => {
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
};

if (pair) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.2, canvasBox.y + canvasBox.height * 0.85);
  await page.waitForTimeout(200);
  await snap();
  await page.mouse.move(pair.a.clickX, pair.a.clickY, { steps: 10 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(80);
    await snap();
  }
  await page.mouse.move(pair.b.clickX, pair.b.clickY, { steps: 10 });
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(80);
    await snap();
  }
} else {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.mouse.move(target.clickX, target.clickY, { steps: 12 });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(80);
    await snap();
  }
}

await page.mouse.click(target.clickX, target.clickY);
await page.waitForTimeout(400);
for (let i = 0; i < 4; i++) {
  await snap();
  await page.waitForTimeout(80);
}
const ox = canvasBox.x + canvasBox.width * 0.5;
const oy = canvasBox.y + canvasBox.height * 0.48;
await page.mouse.move(ox, oy);
await page.mouse.down();
for (let s = 1; s <= 20; s++) {
  await page.mouse.move(ox + (140 * s) / 20, oy - (36 * s) / 20);
  await page.waitForTimeout(45);
  await snap();
}
await page.mouse.up();
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
for (let i = 0; i < 4; i++) {
  await snap();
  await page.waitForTimeout(80);
}

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    "12",
    "-i",
    `${framesDir}/f%04d.png`,
    "-vf",
    "scale=1440:900",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    path.join(OUT, "anchored-lens-hover-demo.mp4"),
  ],
  { stdio: "inherit" },
);

await browser.close();
console.log("Hover artifacts OK:", OUT);
