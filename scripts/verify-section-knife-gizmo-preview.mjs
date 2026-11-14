#!/usr/bin/env node
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-section-knife-kchai.vercel.app/";
const OUT_DIR = "/workspace";
const FRAME_DIR = "/tmp/citycut-section-knife-preview-frames";

async function main() {
  fs.rmSync(FRAME_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAME_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
    });
    await context.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 550;
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("[PAGEERROR]", err.message));

    await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForSelector("button.create-fab", { timeout: 45000 });
    await page.click("button.create-fab");
    await page.waitForSelector(".model .scene-canvas canvas", { timeout: 120000 });
    await page.waitForTimeout(14000);
    await page.locator(".proj-btn.studio-submode-pill", { hasText: "Isometric" }).click();
    await page.waitForTimeout(800);
    await page.locator(".section-knife-toggle").click();
    await page.waitForSelector(".section-knife-elevation", { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const cursor = document.createElement("div");
      cursor.id = "citycut-playwright-cursor";
      cursor.style.cssText =
        "position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #111;background:#fff;box-shadow:0 0 0 1px #fff;z-index:99999;pointer-events:none;left:0;top:0;";
      document.body.appendChild(cursor);
      window.__citycutPlaywrightCursor = (x, y) => {
        cursor.style.transform = `translate(${x}px,${y}px)`;
      };
    });

    const readState = () =>
      page.evaluate(() => {
        const canvas = document.querySelector(".model canvas");
        const note = document.querySelector("[data-section-knife-offset-m]");
        return {
          offset: Number(note?.getAttribute("data-section-knife-offset-m") ?? "0"),
          angle: Number(note?.getAttribute("data-section-knife-angle-rad") ?? "0"),
          camPos: canvas?.dataset.camPosition ?? "",
          handleX: Number(canvas?.dataset.sectionKnifeHandleX ?? "NaN"),
          handleY: Number(canvas?.dataset.sectionKnifeHandleY ?? "NaN"),
          ringX: Number(canvas?.dataset.sectionKnifeRingX ?? "NaN"),
          ringY: Number(canvas?.dataset.sectionKnifeRingY ?? "NaN"),
        };
      });

    let before = await readState();
    for (let i = 0; i < 10 && !Number.isFinite(before.handleX); i++) {
      await page.waitForTimeout(200);
      before = await readState();
    }
    if (!Number.isFinite(before.handleX)) {
      throw new Error(`Handle screen position not published (${before.handleX}, ${before.handleY})`);
    }

    const box = await page.locator(".model canvas").boundingBox();
    if (!box) throw new Error("Canvas bounding box missing");

    const hx = box.x + before.handleX;
    const hy = box.y + before.handleY;
    await page.evaluate(
      ([x, y]) => window.__citycutPlaywrightCursor?.(x, y),
      [hx - 7, hy - 7],
    );
    await page.mouse.move(hx, hy);
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(FRAME_DIR, "frame-000.png") });
    await page.mouse.down();
    for (let i = 0; i < 18; i++) {
      const x = hx - 9 * (i + 1);
      const y = hy + 4 * (i + 1);
      await page.evaluate(([px, py]) => window.__citycutPlaywrightCursor?.(px, py), [x - 7, y - 7]);
      await page.mouse.move(x, y, { steps: 2 });
      await page.waitForTimeout(55);
      await page.screenshot({ path: path.join(FRAME_DIR, `frame-${String(i + 1).padStart(3, "0")}.png`) });
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterHandle = await readState();
    const handleOk = Math.abs(afterHandle.offset - before.offset) > 0.04 && afterHandle.camPos === before.camPos;
    console.log(
      `[HANDLE] offset ${before.offset.toFixed(3)} -> ${afterHandle.offset.toFixed(3)}, camStable=${afterHandle.camPos === before.camPos}, ok=${handleOk}`,
    );
    if (!handleOk) process.exitCode = 1;

    before = await readState();
    for (let i = 0; i < 10 && !Number.isFinite(before.ringX); i++) {
      await page.waitForTimeout(200);
      before = await readState();
    }
    if (!Number.isFinite(before.ringX)) {
      throw new Error(`Ring screen position not published (${before.ringX}, ${before.ringY})`);
    }
    const rx = box.x + before.ringX;
    const ry = box.y + before.ringY;
    await page.mouse.move(rx, ry);
    await page.mouse.down();
    for (let i = 0; i < 14; i++) {
      const x = rx + 11 * (i + 1);
      await page.evaluate(([px, py]) => window.__citycutPlaywrightCursor?.(px, py), [x - 7, ry - 7]);
      await page.mouse.move(x, ry, { steps: 2 });
      await page.waitForTimeout(55);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterRing = await readState();
    const ringOk = Math.abs(afterRing.angle - before.angle) > 0.02 && afterRing.camPos === before.camPos;
    console.log(
      `[RING] angle ${before.angle.toFixed(4)} -> ${afterRing.angle.toFixed(4)}, camStable=${afterRing.camPos === before.camPos}, ok=${ringOk}`,
    );
    if (!ringOk) process.exitCode = 1;

    await context.close();
  } finally {
    await browser.close();
  }

  const mp4 = path.join(OUT_DIR, "section-knife-gizmo-preview-drag.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "14",
      "-i",
      path.join(FRAME_DIR, "frame-%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { stdio: "ignore" },
  );
  console.log(`[ARTIFACT] ${mp4}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
