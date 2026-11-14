import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DANDENONG = {
  lat: -37.98382,
  lon: 145.21555,
  label: "40 Cleeland St, Dandenong VIC 3175",
  km: 1,
};

const MONT_ALBERT = {
  lat: -37.8045,
  lon: 145.1065,
  label: "Mont Albert North",
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

async function openModel(page: Page, baseUrl: string, cut: typeof DANDENONG) {
  const q = new URLSearchParams({
    lat: String(cut.lat),
    lon: String(cut.lon),
    label: cut.label,
    km: String(cut.km),
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
}

describe("top bar design polish", () => {
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
    "styles the collapsed 3D submode select like the active submode pill at 1024",
    async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(360_000);
      try {
        await openModel(page, baseUrl, DANDENONG);
        await page.setViewportSize({ width: 1024, height: 800 });
        await page.waitForTimeout(400);

        const paint = await page.evaluate(() => {
          const el = document.querySelector(".model .topbar-3d-select");
          if (!(el instanceof HTMLElement)) return null;
          const cs = getComputedStyle(el);
          return {
            background: cs.backgroundColor,
            color: cs.color,
            borderTopWidth: cs.borderTopWidth,
            borderTopColor: cs.borderTopColor,
          };
        });
        expect(paint).not.toBeNull();
        expect(paint!.background).toBe("rgb(255, 255, 255)");
        expect(paint!.color).toBe("rgb(20, 20, 19)");
        expect(paint!.borderTopWidth).toBe("1px");
        expect(paint!.borderTopColor).toBe("rgb(217, 216, 211)");
      } finally {
        await browser.close();
      }
    },
    520_000,
  );

  it(
    "shows the full Mont Albert North place label at 1440 in 3D",
    async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(360_000);
      try {
        await openModel(page, baseUrl, MONT_ALBERT);
        await page.setViewportSize({ width: 1440, height: 800 });
        await page.waitForTimeout(400);

        const place = await page.evaluate(() => {
          const chip = document.querySelector(".model .top-bar-left .place-chip.studio-breadcrumb-place");
          if (!(chip instanceof HTMLElement)) return { ok: false, reason: "missing place chip" };
          const text = chip.textContent?.trim() ?? "";
          const full = "Mont Albert North";
          const notClipped = chip.scrollWidth <= chip.clientWidth + 1;
          return { ok: text === full && notClipped, text, notClipped };
        });
        expect(place.ok, `${place.text} clipped=${place.notClipped}`).toBe(true);
      } finally {
        await browser.close();
      }
    },
    520_000,
  );
});