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

function parseHeadingFromAria(aria: string | null): number | null {
  if (!aria) return null;
  const m = aria.match(/heading (\d+) degrees/);
  return m ? Number(m[1]) : null;
}

function northErrorDeg(headingDeg: number): number {
  const h = ((headingDeg % 360) + 360) % 360;
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

  async function waitForSettled3d(page: import("playwright").Page) {
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector(".model canvas");
        if (!canvas) return false;
        const elev = Number(canvas.getAttribute("data-cam-elevation") ?? 0);
        const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
        const pct = pill?.getAttribute("data-progress-pct");
        if (pct !== null && pct !== undefined && Number(pct) < 100) return false;
        const selectUnderlay = document.querySelector(".select");
        const underlayOpacity = selectUnderlay ? Number(getComputedStyle(selectUnderlay).opacity) : 0;
        if (underlayOpacity > 0.05) return false;
        return elev > 20;
      },
      { timeout: 360_000 },
    );
    await page.waitForSelector(".studio-compass", { timeout: 60_000 });
  }

  async function readCompassHeading(page: import("playwright").Page): Promise<number> {
    const aria = await page.locator(".studio-compass").getAttribute("aria-label");
    const h = parseHeadingFromAria(aria);
    if (h === null) throw new Error("missing compass heading");
    return h;
  }

  async function orbitTowardHeading(page: import("playwright").Page, targetDeg: number) {
    const canvas = page.locator(".model canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no model canvas");
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.42;
    for (let step = 0; step < 48; step++) {
      const current = await readCompassHeading(page);
      let d = targetDeg - current;
      d = ((d + 180) % 360 + 360) % 360 - 180;
      if (Math.abs(d) <= 4) return;
      const drag = Math.sign(d) * Math.min(100, Math.max(18, Math.abs(d) * 2.2));
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: "left" });
      await page.mouse.move(cx + drag, cy, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(60);
    }
    const final = await readCompassHeading(page);
    let err = targetDeg - final;
    err = ((err + 180) % 360 + 360) % 360 - 180;
    expect(Math.abs(err)).toBeLessThan(6);
  }

  it(
    "faces north within 400ms after compass click from oblique headings (user path, no qa)",
    async () => {
      const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
      try {
        for (const width of [1280, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          page.setDefaultTimeout(360_000);
          try {
            const q = new URLSearchParams({
              lat: String(DANDENONG.lat),
              lon: String(DANDENONG.lon),
              label: DANDENONG.label,
              km: String(DANDENONG.km),
            });
            await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
            await page.waitForSelector("button.create-fab", { timeout: 60_000 });
            await page.locator("button.create-fab").click({ timeout: 30_000 });
            await page.waitForSelector(".model", { timeout: 360_000 });
            await waitForSettled3d(page);
            const persp = page.locator(".model .proj-btn.studio-submode-pill", { hasText: "Perspective" }).first();
            if ((await persp.count()) > 0) await persp.click();
            await page.waitForTimeout(400);

            for (const targetHeading of [60, 180, 297]) {
              await orbitTowardHeading(page, targetHeading);
              await page.locator(".studio-compass").click();
              await page.waitForTimeout(400);
              const after = await readCompassHeading(page);
              expect(northErrorDeg(after)).toBeLessThanOrEqual(2);
            }
          } finally {
            await page.close();
          }
        }
      } finally {
        await browser.close();
      }
    },
    720_000,
  );
});