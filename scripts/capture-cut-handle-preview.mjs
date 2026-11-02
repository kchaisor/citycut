#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PREVIEW_URL = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-draggable-cut-handles-kchai.vercel.app/";
const ARTIFACTS_DIR = "/workspace";
const TMP_FRAMES = "/tmp/citycut_cut_handle_preview_frames";

async function main() {
  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(PREVIEW_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".select .map-wrap .frame-handle-se", { timeout: 60000 });
  await page.waitForTimeout(1200);

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "preview-cut-handle-drag-before.png") });

  let frameIdx = 0;
  const snap = () => {
    frameIdx += 1;
    page.screenshot({ path: path.join(TMP_FRAMES, `f_${String(frameIdx).padStart(3, "0")}.png`) });
  };
  snap();

  const seHandle = page.locator(".select .map-wrap .frame-handle-se");
  const seBox = await seHandle.boundingBox();
  if (!seBox) throw new Error("SE handle not found");
  const startX = seBox.x + seBox.width / 2;
  const startY = seBox.y + seBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 16; step++) {
    await page.mouse.move(startX + (72 * step) / 16, startY + (72 * step) / 16);
    await page.waitForTimeout(40);
    snap();
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "preview-cut-handle-drag-after.png") });
  snap();

  await page.click("button.create-fab");
  await page.waitForTimeout(400);
  snap();
  await page.waitForSelector(".model", { timeout: 120000 }).catch(() => undefined);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    snap();
  }

  const mp4Out = path.join(ARTIFACTS_DIR, "preview-cut-handle-drag-create.mp4");
  execFileSync("ffmpeg", [
    "-y",
    "-framerate",
    "12",
    "-i",
    `${TMP_FRAMES}/f_%03d.png`,
    "-vf",
    "scale=1440:900",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    mp4Out,
  ]);

  await browser.close();
  console.log(`Saved ${path.join(ARTIFACTS_DIR, "preview-cut-handle-drag-before.png")}`);
  console.log(`Saved ${path.join(ARTIFACTS_DIR, "preview-cut-handle-drag-after.png")}`);
  console.log(`Saved ${mp4Out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
