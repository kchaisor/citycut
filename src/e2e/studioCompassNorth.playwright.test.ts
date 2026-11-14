import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DANDENONG = {
  lat: -37.98382,
  lon: 145.21555,
  label: "40 Cleeland St, Dandenong VIC 3175",
  km: 1,
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitForHttp(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(poll, 250);
    };
    void poll();
  });
}

type CamProbe = { bearing: number; elevation: number; distance: number };

function northErrorDeg(bearingDeg: number): number {
  const b = Number(bearingDeg);
  const h = ((b % 360) + 360) % 360;
  return h > 180 ? 360 - h : h;
}

describe("studio compass face north", () => {
  let preview: ChildProcess;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      const build = spawn("npm", ["run", "build"], { cwd: REPO_ROOT, stdio: "ignore" });
      build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exited ${code}`))));
    });

    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}/citycut/`;
    preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    await waitForHttp(baseUrl);
  }, 300_000);

  afterAll(() => {
    preview?.kill("SIGTERM");
  });

  async function waitForUserPathReady(page: import("playwright").Page) {
    await page.waitForSelector(".model", { timeout: 360_000 });
    await page.waitForFunction(
      () => !document.querySelector(".model[data-intro-hold]"),
      undefined,
      { timeout: 360_000 },
    );
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector(".model canvas");
        return canvas && Number(canvas.getAttribute("data-cam-elevation") ?? 0) > 15;
      },
      undefined,
      { timeout: 360_000 },
    );
    await page.waitForSelector(".studio-compass", { timeout: 60_000 });
  }

  async function readCam(page: import("playwright").Page): Promise<CamProbe> {
    return page.evaluate(() => {
      const canvas = document.querySelector(".model canvas");
      if (!canvas) throw new Error("no canvas");
      return {
        bearing: Number(canvas.getAttribute("data-cam-bearing") ?? "999"),
        elevation: Number(canvas.getAttribute("data-cam-elevation") ?? "0"),
        distance: Number(canvas.getAttribute("data-cam-distance") ?? "0"),
      };
    });
  }

  async function orbitTowardBearing(page: import("playwright").Page, targetDeg: number) {
    const canvas = page.locator(".model canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no model canvas");
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.42;
    for (let step = 0; step < 50; step++) {
      const { bearing } = await readCam(page);
      let d = targetDeg - bearing;
      d = ((d + 180) % 360 + 360) % 360 - 180;
      if (Math.abs(d) <= 5) return;
      const drag = Math.sign(d) * Math.min(90, Math.max(20, Math.abs(d) * 2));
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "left" });
      await page.mouse.move(cx + drag, cy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(70);
    }
    const { bearing } = await readCam(page);
    let err = targetDeg - bearing;
    err = ((err + 180) % 360 + 360) % 360 - 180;
    expect(Math.abs(err)).toBeLessThan(8);
  }

  it(
    "faces north by 400ms and holds at 1500ms from ~60° and ~200° (user path, no qa)",
    async () => {
      const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
      const timings: {
        heading: number;
        northErr400: number;
        northErr1500: number;
        bearing400: number;
        bearing1500: number;
      }[] = [];
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.setDefaultTimeout(360_000);
        const q = new URLSearchParams({
          lat: String(DANDENONG.lat),
          lon: String(DANDENONG.lon),
          label: DANDENONG.label,
          km: String(DANDENONG.km),
        });
        await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector("button.create-fab", { timeout: 60_000 });
        await page.locator("button.create-fab").click({ timeout: 30_000 });
        await waitForUserPathReady(page);
        const persp = page.locator(".model .proj-btn.studio-submode-pill", { hasText: "Perspective" }).first();
        if ((await persp.count()) > 0) await persp.click();
        await page.waitForTimeout(350);

        for (const targetHeading of [60, 200]) {
          await orbitTowardBearing(page, targetHeading);
          const before = await readCam(page);
          await page.locator(".studio-compass").click();
          await page.waitForTimeout(400);
          const at400 = await readCam(page);
          await page.waitForTimeout(1100);
          const at1500 = await readCam(page);

          expect(northErrorDeg(at400.bearing)).toBeLessThanOrEqual(2);
          expect(northErrorDeg(at1500.bearing)).toBeLessThanOrEqual(2);
          expect(Math.abs(at400.elevation - before.elevation)).toBeLessThan(1.5);
          expect(Math.abs(at1500.elevation - before.elevation)).toBeLessThan(1.5);
          expect(Math.abs(at400.distance - before.distance)).toBeLessThan(3);
          expect(Math.abs(at1500.distance - before.distance)).toBeLessThan(3);

          timings.push({
            heading: targetHeading,
            northErr400: northErrorDeg(at400.bearing),
            northErr1500: northErrorDeg(at1500.bearing),
            bearing400: at400.bearing,
            bearing1500: at1500.bearing,
          });
        }
        console.log("compass-north-e2e-timings", JSON.stringify(timings));
      } finally {
        await browser.close();
      }
    },
    720_000,
  );
});