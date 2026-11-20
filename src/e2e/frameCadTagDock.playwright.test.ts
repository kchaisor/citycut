import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DANDENONG = { lat: -37.98382, lon: 145.21555, label: "Dandenong" };
const CLEARANCE_PX = 8;

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

describe("frame CAD tag vs landing dock", () => {
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
  }, 180_000);

  afterAll(() => {
    preview?.kill("SIGTERM");
  });

  async function assertCadTagClearsDock(viewport: { width: number; height: number }) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage();
    try {
      await page.setViewportSize(viewport);
      const q = new URLSearchParams({
        lat: String(DANDENONG.lat),
        lon: String(DANDENONG.lon),
        label: DANDENONG.label,
      });
      await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForSelector(".landing-workbench-dock", { timeout: 30_000 });
      await page.getByRole("button", { name: "A3", exact: true }).click();
      await page.getByRole("button", { name: "1:3500", exact: true }).click();
      await page.waitForSelector(".map-wrap .frame-cad-tag", { timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const chip = document.querySelector(".map-wrap .frame-cad-tag");
          return chip != null && chip.getBoundingClientRect().height > 0;
        },
        { timeout: 15_000 },
      );

      const rects = await page.evaluate(() => {
        const chip = document.querySelector(".map-wrap .frame-cad-tag")!.getBoundingClientRect();
        const dock = document.querySelector(".landing-workbench-dock")!.getBoundingClientRect();
        return {
          chip: { top: chip.top, bottom: chip.bottom, left: chip.left, right: chip.right },
          dock: { top: dock.top, bottom: dock.bottom, left: dock.left, right: dock.right },
        };
      });

      expect(rects.chip.bottom).toBeLessThanOrEqual(rects.dock.top - CLEARANCE_PX);
      expect(
        rects.chip.right <= rects.dock.left ||
          rects.chip.left >= rects.dock.right ||
          rects.chip.bottom <= rects.dock.top ||
          rects.chip.top >= rects.dock.bottom,
      ).toBe(true);
      return rects;
    } finally {
      await browser.close();
    }
  }

  it(
    "keeps the readout chip clear of the dock at 1280×800 after A3 @ 1:3500",
    async () => {
      await assertCadTagClearsDock({ width: 1280, height: 800 });
    },
    120_000,
  );

  it(
    "keeps the readout chip clear of the dock at 1440×800 after A3 @ 1:3500",
    async () => {
      await assertCadTagClearsDock({ width: 1440, height: 800 });
    },
    120_000,
  );
});
