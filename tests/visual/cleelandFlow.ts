import type { Page } from "@playwright/test";
import { computePerspectiveViewportPose } from "../../src/lib/perspectiveViewportFit";

const CLEELAND_LAT = -37.98382;
const CLEELAND_LON = 145.21555;

function appDefaultOverviewCamera(sideM: number) {
  const pose = computePerspectiveViewportPose({
    side: sideM,
    lift: 25,
    groundY: 0,
    siteTopY: 45,
    heliodonRadius: sideM * 0.4,
    solar: {
      showPath: false,
      castShadows: false,
      radiusFactor: 1,
      year: 2026,
      month: 9,
      day: 22,
      hour: 15,
      minute: 0,
    },
    lat: CLEELAND_LAT,
    lon: CLEELAND_LON,
    fov: 50,
    aspect: 1440 / 900,
  });
  return {
    eye: { x: pose.eye[0], y: pose.eye[1], z: pose.eye[2] },
    target: { x: pose.target[0], y: pose.target[1], z: pose.target[2] },
  };
}

export const CLEELAND_CUT = {
  searchParams: new URLSearchParams({
    lat: "-37.98382",
    lon: "145.21555",
    label: "40 Cleeland St, Dandenong VIC 3175",
    km: "1",
  }).toString(),
};

export function attachConsoleSentinel(page: Page, errors: string[]): void {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
}

export async function modelReady(page: Page): Promise<void> {
  await page.waitForSelector(".model", { timeout: 360_000 });
  await page.waitForFunction(
    () => {
      const left = document.querySelector(".model .top-bar-left");
      return left != null && Number(getComputedStyle(left).opacity) > 0.9;
    },
    { timeout: 120_000 },
  );
}

export async function waitForWebGlCanvas(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return Boolean(canvas && canvas.width > 800 && canvas.height > 500);
    },
    { timeout: 120_000 },
  );
}

export async function introDone(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const done = () => resolve();
        window.addEventListener("citycut:intro-done", done, { once: true });
        setTimeout(done, 45_000);
      }),
  );
}

export async function waitForModelSceneSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const readyEl = document.querySelector(".model .ready-text");
      const text = readyEl?.textContent ?? "";
      const match = /Ready ·\s*(\d+)\/(\d+)\s+sources/.exec(text);
      if (!match) return false;
      const loaded = Number(match[1]);
      const total = Number(match[2]);
      if (total === 0 || loaded < total) return false;

      const sceneCanvas = document.querySelector(".scene-viewport canvas") as HTMLCanvasElement | null;
      const spanX = Number(sceneCanvas?.dataset.citycutGroundSpanX ?? 0);
      const spanZ = Number(sceneCanvas?.dataset.citycutGroundSpanZ ?? 0);

      const summary = window.__citycutQaModel?.getSummary?.();
      const buildings = summary?.buildingCount ?? 0;
      const roads = summary?.roadCount ?? 0;

      const bridgePill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      const bridgeOpacity = bridgePill ? Number(getComputedStyle(bridgePill).opacity) : 0;

      return spanX > 100 && spanZ > 100 && buildings > 30 && roads > 10 && bridgeOpacity <= 0.05;
    },
    { timeout: 360_000 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

export async function applyAppDefaultOverviewCamera(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__citycutQa?.setCamera === "function", { timeout: 120_000 });
  const sideM = await page.evaluate(() => {
    const label = document.querySelector(".model")?.getAttribute("data-cut-size-label") ?? "";
    const m = /(\d+)\s*×\s*(\d+)\s*m/.exec(label);
    if (!m) return 1000;
    return Math.max(Number(m[1]), Number(m[2]));
  });
  const pose = appDefaultOverviewCamera(sideM);
  await page.evaluate((p) => {
    window.__citycutQa?.setCamera(p);
  }, pose);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}

export async function activateModelTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name });
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    const value = name === "3D model" ? "3d" : name === "Drawing" ? "drawing" : "satellite";
    await page.locator(".model .topbar-view-select").selectOption(value);
    return;
  }
  await tab.evaluate((el) => {
    (el as HTMLButtonElement).click();
  });
}