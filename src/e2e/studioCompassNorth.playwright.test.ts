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

  it(
    "clicking the compass returns to north-up from 60°, 180° and 297° headings",
    async () => {
      const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.setDefaultTimeout(360_000);
      try {
        const q = new URLSearchParams({
          lat: String(DANDENONG.lat),
          lon: String(DANDENONG.lon),
          label: DANDENONG.label,
          km: String(DANDENONG.km),
          qa: "1",
        });
        await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector("button.create-fab", { timeout: 60_000 });
        await page.locator("button.create-fab").click({ timeout: 30_000 });
        await page.waitForSelector(".model", { timeout: 360_000 });
        await page.waitForFunction(
          () => Boolean(window.__citycutCompassQa && document.querySelector(".studio-compass")),
          { timeout: 240_000 },
        );
        const persp = page.locator(".model .proj-btn.studio-submode-pill", { hasText: "Perspective" }).first();
        if ((await persp.count()) > 0) await persp.click();
        await page.waitForTimeout(400);

        for (const heading of [60, 180, 297]) {
          await page.evaluate((deg) => {
            window.__citycutCompassQa?.setCameraHeadingDeg(deg);
          }, heading);
          await page.waitForTimeout(120);
          const before = await page.evaluate(
            ({ target }) => {
              const h = window.__citycutCompassQa?.getCameraHeadingDeg() ?? 0;
              let d = target - h;
              d = ((d + 180) % 360 + 360) % 360 - 180;
              return { h, delta: Math.abs(d) };
            },
            { target: heading },
          );
          expect(before.delta).toBeLessThan(2);

          await page.locator(".studio-compass").click();
          await page.waitForTimeout(600);

          const after = await page.evaluate(() => ({
            heading: window.__citycutCompassQa?.getCameraHeadingDeg() ?? 999,
            needle: window.__citycutCompassQa?.getNeedleDeg() ?? 999,
          }));
          let northErr = Math.abs(after.heading);
          if (northErr > 180) northErr = 360 - northErr;
          expect(northErr).toBeLessThanOrEqual(1);
          expect(Math.abs(after.needle)).toBeLessThanOrEqual(1);
        }
      } finally {
        await browser.close();
      }
    },
    420_000,
  );
});