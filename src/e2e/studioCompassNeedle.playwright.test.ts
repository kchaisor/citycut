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

describe("studio compass needle", () => {
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

  function northErrorDeg(bearingDeg: number): number {
    const h = ((bearingDeg % 360) + 360) % 360;
    return h > 180 ? 360 - h : h;
  }

  function readNeedleAndBearing(page: import("playwright").Page) {
    return page.evaluate(() => {
      const canvas = document.querySelector(".model canvas");
      const needleG = document.querySelector(".studio-compass-needle g");
      if (!canvas || !needleG) throw new Error("missing compass or canvas");
      const transform = needleG.getAttribute("transform") ?? "";
      const match = /rotate\(([-\d.]+)/.exec(transform);
      const needleDeg = match ? Number(match[1]) : NaN;
      const bearing = Number(canvas.getAttribute("data-cam-bearing") ?? "999");
      return { needleDeg, bearing };
    });
  }

  async function orbitDrag(page: import("playwright").Page) {
    const canvas = page.locator(".model canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no model canvas");
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.42;
    for (let pass = 0; pass < 3; pass++) {
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "left" });
      await page.mouse.move(cx + 160, cy + 25, { steps: 18 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const { bearing } = await readNeedleAndBearing(page);
      if (northErrorDeg(bearing) > 15) return;
    }
    const { bearing } = await readNeedleAndBearing(page);
    expect(northErrorDeg(bearing)).toBeGreaterThan(15);
  }

  it(
    "tracks -heading within 1° after orbit; tapping the compass chip does not move the camera",
    async () => {
      const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
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

        await orbitDrag(page);
        const afterOrbit = await readNeedleAndBearing(page);
        expect(Math.abs(afterOrbit.needleDeg + afterOrbit.bearing)).toBeLessThanOrEqual(1);

        const compass = page.locator(".studio-compass").first();
        const chipBox = await compass.boundingBox();
        expect(chipBox).toBeTruthy();
        const beforeClick = await readNeedleAndBearing(page);
        const northErrBefore = northErrorDeg(beforeClick.bearing);
        expect(northErrBefore).toBeGreaterThan(15);

        await page.mouse.click(chipBox!.x + chipBox!.width / 2, chipBox!.y + chipBox!.height / 2);
        await page.waitForTimeout(400);
        const afterClick = await readNeedleAndBearing(page);
        const northErrAfter = northErrorDeg(afterClick.bearing);
        expect(northErrAfter).toBeGreaterThan(10);
        expect(Math.abs(northErrAfter - northErrBefore)).toBeLessThan(5);
        expect(Math.abs(afterClick.needleDeg + afterClick.bearing)).toBeLessThanOrEqual(1);

        console.log(
          "compass-needle-e2e",
          JSON.stringify({
            bearingAfterOrbit: afterOrbit.bearing,
            needleAfterOrbit: afterOrbit.needleDeg,
            bearingAfterClick: afterClick.bearing,
          }),
        );
      } finally {
        await browser.close();
      }
    },
    720_000,
  );
});