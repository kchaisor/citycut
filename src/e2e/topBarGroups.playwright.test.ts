import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ROZELLE = {
  lat: -33.8677,
  lon: 151.1832,
  label: "Rozelle NSW",
  km: 1,
};

const VIEWPORTS = [1024, 1280, 1440] as const;
const HEIGHT = 800;

type Rect = { left: number; top: number; right: number; bottom: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return xOverlap > 0.5 && yOverlap > 0.5;
}

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

async function readTopBarRects(page: Page): Promise<Record<"left" | "center" | "right", Rect>> {
  return page.evaluate(() => {
    const pick = (sel: string): Rect => {
      const el = document.querySelector(sel)!;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      left: pick(".model .top-bar-left"),
      center: pick(".model .top-bar-center"),
      right: pick(".model .top-bar-right"),
    };
  });
}

function assertGroupsSeparate(rects: Record<"left" | "center" | "right", Rect>) {
  expect(rectsOverlap(rects.left, rects.center)).toBe(false);
  expect(rectsOverlap(rects.left, rects.right)).toBe(false);
  expect(rectsOverlap(rects.center, rects.right)).toBe(false);
}

async function activateTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await tab.evaluate((el) => {
    (el as HTMLButtonElement).click();
  });
}

describe("model top bar group layout", () => {
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
  }, 240_000);

  afterAll(() => {
    preview?.kill("SIGTERM");
  });

  it(
    "keeps top bar groups from overlapping at 1024, 1280, and 1440 in 3D and Drawing",
    async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(360_000);
      try {
        await page.setViewportSize({ width: 1440, height: HEIGHT });
        const q = new URLSearchParams({
          lat: String(ROZELLE.lat),
          lon: String(ROZELLE.lon),
          label: ROZELLE.label,
          km: String(ROZELLE.km),
        });
        await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector("button.create-fab", { timeout: 60_000 });
        await page.locator("button.create-fab").click({ timeout: 30_000 });
        await page.waitForSelector(".model", { timeout: 360_000 });
        await page.waitForFunction(
          () => {
            const left = document.querySelector(".model .top-bar-left");
            if (!left) return false;
            return Number(getComputedStyle(left).opacity) > 0.9;
          },
          { timeout: 120_000 },
        );

        for (const width of VIEWPORTS) {
          await page.setViewportSize({ width, height: HEIGHT });
          await page.waitForTimeout(250);

          const on3d =
            (await page.getByRole("tab", { name: "3D model" }).getAttribute("aria-selected")) === "true";
          if (!on3d) {
            await activateTab(page, "3D model");
          }
          assertGroupsSeparate(await readTopBarRects(page));

          await activateTab(page, "Drawing");
          await page.waitForSelector("svg.plan", { timeout: 120_000 });
          assertGroupsSeparate(await readTopBarRects(page));
        }
      } finally {
        await browser.close();
      }
    },
    480_000,
  );
});
