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

const COMPACT_WIDTHS = [1024, 1280] as const;

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

async function openModel(page: Page, baseUrl: string) {
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
  await page.waitForFunction(
    () => {
      const left = document.querySelector(".model .top-bar-left");
      if (!left) return false;
      return Number(getComputedStyle(left).opacity) > 0.9;
    },
    { timeout: 120_000 },
  );
}

async function setCompactViewport(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForTimeout(400);
}

async function switchView(page: Page, name: "3D model" | "Drawing") {
  const tab = page.getByRole("tab", { name });
  if (await tab.isVisible().catch(() => false)) {
    await tab.evaluate((el) => (el as HTMLButtonElement).click());
    return;
  }
  await page.locator(".model .topbar-view-select").selectOption(name === "3D model" ? "3d" : "drawing");
}

async function assertExportMenuHitTest(page: Page) {
  const result = await page.evaluate(() => {
    const menu = document.querySelector(".model .topbar-export-menu");
    if (!(menu instanceof HTMLElement) || menu.hidden) {
      return { ok: false, errors: ["export menu not open"] };
    }
    const errors: string[] = [];
    const items = [...menu.querySelectorAll(".topbar-export-menu-item[aria-label]")];
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const onItem = hit === item || (hit instanceof Node && item.contains(hit));
      if (!onItem) {
        const obscurer =
          hit instanceof HTMLElement
            ? hit.className || hit.tagName
            : hit === null
              ? "null"
              : String(hit);
        errors.push(`"${item.getAttribute("aria-label")}" obscured at centre by ${obscurer}`);
      }
    }
    return { ok: errors.length === 0, errors };
  });
  expect(result.ok, result.errors?.join("; ")).toBe(true);
}

describe("top bar export menu (compact)", () => {
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

  for (const width of COMPACT_WIDTHS) {
    it(
      `draws Drawing export menu above chrome with hit targets at ${width}`,
      async () => {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        page.setDefaultTimeout(360_000);
        try {
          await openModel(page, baseUrl);
          await setCompactViewport(page, width);
          await switchView(page, "Drawing");
          await page.waitForSelector("svg.plan", { timeout: 120_000 });

          await page.locator(".model .topbar-export-trigger").click();
          await page.waitForFunction(
            () => {
              const menu = document.querySelector(".model .topbar-export-menu");
              return menu instanceof HTMLElement && !menu.hidden;
            },
            { timeout: 10_000 },
          );

          const drawingItems = await page.evaluate(() => {
            const menu = document.querySelector(".model .topbar-export-menu");
            if (!(menu instanceof HTMLElement) || menu.hidden) return [] as string[];
            return [...menu.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") ?? "");
          });
          expect(drawingItems).toEqual(
            expect.arrayContaining([
              "Quick export Adobe Illustrator .ai",
              "Quick export SVG",
              "Quick export 3dm",
            ]),
          );
          expect(drawingItems.length).toBe(3);
          await assertExportMenuHitTest(page);

          await page.keyboard.press("Escape");
          const focusedExport = await page.evaluate(
            () => document.activeElement?.classList.contains("topbar-export-trigger") ?? false,
          );
          expect(focusedExport).toBe(true);
        } finally {
          await browser.close();
        }
      },
      520_000,
    );

    it(
      `draws 3D export menu above chrome with hit targets at ${width}`,
      async () => {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        page.setDefaultTimeout(360_000);
        try {
          await openModel(page, baseUrl);
          await setCompactViewport(page, width);
          await switchView(page, "3D model");
          await page.waitForTimeout(300);

          await page.locator(".model .topbar-export-trigger").click();
          await page.waitForFunction(
            () => {
              const menu = document.querySelector(".model .topbar-export-menu");
              return menu instanceof HTMLElement && !menu.hidden;
            },
            { timeout: 10_000 },
          );

          const exportItems = await page.evaluate(() => {
            const menu = document.querySelector(".model .topbar-export-menu");
            if (!(menu instanceof HTMLElement) || menu.hidden) return [] as string[];
            return [...menu.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") ?? "");
          });
          expect(exportItems).toEqual(
            expect.arrayContaining(["Quick export Rhino .3dm", "Quick export 2x PNG"]),
          );
          expect(exportItems.length).toBe(2);
          await assertExportMenuHitTest(page);

          await page.keyboard.press("Escape");
          const focusedExport = await page.evaluate(
            () => document.activeElement?.classList.contains("topbar-export-trigger") ?? false,
          );
          expect(focusedExport).toBe(true);
        } finally {
          await browser.close();
        }
      },
      520_000,
    );
  }
});