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

const VIEWPORTS = [1024, 1280, 1360, 1440] as const;
const HEIGHT = 800;

type TopBarAudit = {
  ok: boolean;
  errors: string[];
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

async function auditTopBar(page: Page): Promise<TopBarAudit> {
  return page.evaluate(() => {
    const errors: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const isVisible = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0.5 && rect.height > 0.5;
    };

    const boxNotClipped = (el: HTMLElement, name: string) => {
      if (!isVisible(el)) return;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        errors.push(`"${name}" clips inside its box (${el.scrollWidth}×${el.scrollHeight} > ${el.clientWidth}×${el.clientHeight})`);
      }
    };

    const groupSels = [".model .top-bar-left", ".model .top-bar-center", ".model .top-bar-right"] as const;
    const groupEls = groupSels.map((sel) => document.querySelector(sel) as HTMLElement | null);
    if (groupEls.some((el) => !el)) {
      return { ok: false, errors: ["missing top bar group"] };
    }

    const rects = groupEls.map((el) => {
      const r = el!.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });

    const names = ["left", "center", "right"] as const;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const xOverlap = Math.min(rects[i]!.right, rects[j]!.right) - Math.max(rects[i]!.left, rects[j]!.left);
        const yOverlap = Math.min(rects[i]!.bottom, rects[j]!.bottom) - Math.max(rects[i]!.top, rects[j]!.top);
        if (xOverlap > 0.5 && yOverlap > 0.5) {
          errors.push(`groups ${names[i]} and ${names[j]} intersect (${Math.round(xOverlap)}×${Math.round(yOverlap)}px)`);
        }
      }
    }

    const chips = document.querySelectorAll(
      ".model .top-bar-left .dim-chip, .model .top-bar-left .sidebar-brand-name, .model .top-bar-right .ready-text",
    );
    for (const chip of chips) {
      const el = chip as HTMLElement;
      const label = el.textContent?.trim() || el.className;
      boxNotClipped(el, label);
    }

    const place = document.querySelector(".model .top-bar-left .place-chip") as HTMLElement | null;
    if (place) {
      const full = place.textContent?.trim() ?? "";
      if (full.length === 0) {
        errors.push("place name missing");
      } else if (!isVisible(place)) {
        errors.push("place name not visible");
      } else {
        const approxVisible =
          place.scrollWidth <= place.clientWidth + 1
            ? full.length
            : Math.floor(full.length * (place.clientWidth / Math.max(place.scrollWidth, 1)));
        if (full.length >= 10 && approxVisible < 10) {
          errors.push(`place name shows only ~${approxVisible} visible characters (need ≥10)`);
        }
      }
    }

    const dim = document.querySelector(".model .top-bar-left .dim-chip") as HTMLElement | null;
    if (dim && isVisible(dim)) {
      const t = dim.textContent?.trim() ?? "";
      if (t.length > 0 && (t.length < 4 || !/\d/.test(t) || !/[×m]/.test(t))) {
        errors.push(`size chip looks fragmented: "${t}"`);
      }
    }

    const controls = document.querySelectorAll(
      ".model .top-bar-left button, .model .top-bar-left select, .model .top-bar-center button, .model .top-bar-center select, .model .top-bar-right button",
    );
    for (const control of controls) {
      const html = control as HTMLElement;
      if (!isVisible(html)) continue;
      let ancestor: HTMLElement | null = html.parentElement;
      let hiddenAncestor = false;
      while (ancestor) {
        const acs = getComputedStyle(ancestor);
        if (acs.display === "none" || acs.visibility === "hidden") {
          hiddenAncestor = true;
          break;
        }
        if (
          ancestor.classList.contains("top-bar-left") ||
          ancestor.classList.contains("top-bar-center") ||
          ancestor.classList.contains("top-bar-right")
        ) {
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (hiddenAncestor) continue;

      const label = html.getAttribute("aria-label") ?? html.textContent?.trim() ?? control.tagName;
      boxNotClipped(html, label);

      let group: HTMLElement | null = null;
      let parent: HTMLElement | null = html;
      while (parent) {
        if (
          parent.classList.contains("top-bar-left") ||
          parent.classList.contains("top-bar-center") ||
          parent.classList.contains("top-bar-right")
        ) {
          group = parent;
          break;
        }
        parent = parent.parentElement;
      }
      if (!group) continue;
      const cr = html.getBoundingClientRect();
      const gr = group.getBoundingClientRect();
      if (cr.left < gr.left - 0.5 || cr.right > gr.right + 0.5 || cr.top < gr.top - 0.5 || cr.bottom > gr.bottom + 0.5) {
        errors.push(`control "${label}" clips outside its group`);
      }
      if (cr.right > vw + 0.5 || cr.left < -0.5 || cr.bottom > vh + 0.5 || cr.top < -0.5) {
        errors.push(`control "${label}" clips outside viewport`);
      }
    }

    const brand = document.querySelector(".model .top-bar-left .sidebar-brand-name") as HTMLElement | null;
    if (brand && place && isVisible(brand) && isVisible(place)) {
      const br = brand.getBoundingClientRect();
      const pr = place.getBoundingClientRect();
      const xOverlap = Math.min(br.right, pr.right) - Math.max(br.left, pr.left);
      const yOverlap = Math.min(br.bottom, pr.bottom) - Math.max(br.top, pr.top);
      if (xOverlap > 0.5 && yOverlap > 0.5) {
        errors.push("place name overlaps CityCut wordmark");
      }
      if (pr.left < br.right - 0.5) {
        errors.push("place name starts before wordmark ends");
      }
    }

  return { ok: errors.length === 0, errors };
  });
}

async function activateTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    await page.locator(".model .topbar-view-select").selectOption(
      name === "3D model" ? "3d" : name === "Drawing" ? "drawing" : "satellite",
    );
    return;
  }
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
    "keeps top bar groups separate with unclipped controls at 1024–1440",
    async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(360_000);
      try {
        await page.setViewportSize({ width: 1440, height: HEIGHT });
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

        for (const width of VIEWPORTS) {
          await page.setViewportSize({ width, height: HEIGHT });
          await page.waitForTimeout(400);

          await activateTab(page, "3D model");
          await page.waitForTimeout(200);
          const audit3d = await auditTopBar(page);
          expect(audit3d, audit3d.errors.join("; ")).toMatchObject({ ok: true });

          await activateTab(page, "Drawing");
          await page.waitForSelector("svg.plan", { timeout: 120_000 });
          await page.waitForTimeout(200);
          const auditDrawing = await auditTopBar(page);
          expect(auditDrawing, auditDrawing.errors.join("; ")).toMatchObject({ ok: true });
        }
      } finally {
        await browser.close();
      }
    },
    520_000,
  );
});
