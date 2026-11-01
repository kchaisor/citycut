import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const CHROME_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--no-sandbox",
];

const BOX_HILL = { lat: -37.8187756, lon: 145.1266505, km: 1, label: "Box Hill VIC" };

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 4173;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

async function startPreview(port, cwd) {
  const proc = spawn(
    path.join(cwd, "node_modules/.bin/vite"),
    ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } },
  );
  const baseUrl = `http://127.0.0.1:${port}/citycut/`;
  await waitForServer(baseUrl);
  return { proc, baseUrl };
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

function parseArgs(argv) {
  const out = { tag: "orbit", outDir: "/opt/cursor/artifacts", cwd: process.cwd(), overrides: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tag") out.tag = argv[++i];
    else if (arg === "--out") out.outDir = argv[++i];
    else if (arg === "--cwd") out.cwd = argv[++i];
    else if (arg === "--baseline-183") out.overrides = { aoOffWhileMoving: true, dprDropWhileOrbiting: true };
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.outDir, { recursive: true });
  const framesDir = path.join(args.outDir, `box-hill-orbit-${args.tag}-frames`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const port = await findFreePort();
  const { proc, baseUrl } = await startPreview(port, args.cwd);
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: CHROME_ARGS });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page.setDefaultTimeout(180000);
    await page.addInitScript((ov) => {
      window.localStorage.setItem("citycut.view3d.quality", "high");
      window.__citycutMinSilentLoadMs = 0;
      window.__citycutPerfOverrides = ov;
    }, args.overrides);
    const url = `${baseUrl}?qa=1&view=persp&lat=${BOX_HILL.lat}&lon=${BOX_HILL.lon}&km=${BOX_HILL.km}&label=${encodeURIComponent(BOX_HILL.label)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.locator("button.create-fab").click();
    await page.waitForSelector(".model", { timeout: 600000 });
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector(".model canvas");
        return Boolean(canvas && canvas.width > 800);
      },
      { timeout: 120000 },
    );
    await waitIntroDone(page);
    await page.waitForTimeout(2500);
    await page.evaluate((ov) => {
      window.__citycutPerfOverrides = ov;
      window.__citycutPerf?.setOverrides?.(ov);
    }, args.overrides);
    await page.waitForTimeout(400);

    const canvas = page.locator(".model canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas");
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.42;
    await page.mouse.move(cx, cy);
    await page.mouse.down();

    const totalFrames = 90;
    const steps = 90;
    for (let i = 0; i < totalFrames; i++) {
      const t = i / steps;
      await page.mouse.move(cx + Math.sin(t * Math.PI * 2) * box.width * 0.22, cy + t * 4 - 2, { steps: 1 });
      await page.waitForTimeout(100);
      const framePath = path.join(framesDir, `frame_${String(i + 1).padStart(4, "0")}.png`);
      await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });
    }
    await page.mouse.up();

    const mp4Out = path.join(args.outDir, `box-hill-orbit-high-${args.tag}.mp4`);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "10",
        "-i",
        path.join(framesDir, "frame_%04d.png"),
        "-vf",
        "scale=1440:900",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        mp4Out,
      ],
      { stdio: "inherit" },
    );
    console.log("Wrote", mp4Out);
  } finally {
    await browser.close();
    proc.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
