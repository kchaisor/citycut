import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PREVIEW_BASE = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-anchored-lens-hover-highlight-kchai.vercel.app/";
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

const consoleErrors = [];
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
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

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
const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No canvas");

await page.mouse.move(canvasBox.x + canvasBox.width * 0.12, canvasBox.y + canvasBox.height * 0.92);
await page.waitForTimeout(300);
await page.mouse.move(target.clickX, target.clickY);
await page.waitForTimeout(450);
await page.waitForFunction(
  () => {
    const canvas = document.querySelector(".model canvas");
    return (
      canvas instanceof HTMLCanvasElement &&
      canvas.dataset.buildingHoverHighlightActive === "1" &&
      !document.querySelector('[data-anchored-lens="open"]')
    );
  },
  { timeout: 10000 },
);
await page.screenshot({ path: path.join(OUT, "hover-only.png") });

const pinClick =
  (await page.evaluate((id) => window.__citycutQaModel?.resolveLensBuildingClick?.(id) ?? null, target.id)) ??
  target;
await page.mouse.click(pinClick.clickX, pinClick.clickY);
try {
  await page.waitForFunction(
    () =>
      window.__citycutQaModel?.getAnchoredLensMode?.() === "pinned" &&
      Boolean(document.querySelector('[data-anchored-lens="open"]')),
    { timeout: 12000 },
  );
} catch {
  await page.evaluate((id) => window.__citycutQaModel?.openAnchoredLensForBuilding?.(id), target.id);
  await page.waitForFunction(
    () =>
      window.__citycutQaModel?.getAnchoredLensMode?.() === "pinned" &&
      Boolean(document.querySelector('[data-anchored-lens="open"]')),
    { timeout: 12000 },
  );
}
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "click-pinned.png") });

await page.locator('[data-anchored-lens-action="ripple"]').click({ force: true });
await page.waitForTimeout(800);

await page.keyboard.press("Escape");
await page.waitForFunction(() => !document.querySelector('[data-anchored-lens="open"]'), { timeout: 8000 });

const pair = await page.evaluate(() => window.__citycutQaModel?.findLensHoverPairQa?.() ?? null);
const framesDir = "/tmp/hover_only_video_frames";
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
let fi = 0;
const snap = async () => {
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
};

if (pair) {
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = pair.a.clickX + (pair.b.clickX - pair.a.clickX) * t;
    const y = pair.a.clickY + (pair.b.clickY - pair.a.clickY) * t;
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(70);
    await snap();
  }
} else {
  await page.mouse.move(target.clickX, target.clickY);
  await snap();
  await page.waitForTimeout(150);
  await page.mouse.move(target.clickX + 36, target.clickY + 18);
  await snap();
}

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    "12",
    "-i",
    path.join(framesDir, "f%04d.png"),
    "-vf",
    "scale=1440:900",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path.join(OUT, "hover-only-demo.mp4"),
  ],
  { stdio: "inherit" },
);

fs.writeFileSync(
  path.join(OUT, "hover-only-report.json"),
  JSON.stringify({ consoleErrors, previewUrl: previewUrl() }, null, 2),
);

await browser.close();
console.log(JSON.stringify({ consoleErrors: consoleErrors.length }, null, 2));
