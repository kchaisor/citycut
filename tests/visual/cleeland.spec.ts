import { expect, test } from "@playwright/test";
import { activateModelTab, attachConsoleSentinel, CLEELAND_CUT, introDone, modelReady, waitForWebGlCanvas } from "./cleelandFlow";

const LANDING_MAX_DIFF = 0.02;
const DRAWING_MAX_DIFF = 0.02;
const MODEL_3D_MAX_DIFF = 0.06;

const FIXED_CAMERA = {
  eye: { x: 42, y: 6, z: 48 },
  target: { x: 0, y: 1.5, z: 0 },
};

test.describe.configure({ mode: "serial" });

test.describe("Cleeland 1 km @ 1440×900", () => {
  const consoleErrors: string[] = [];

  test.beforeEach(({ page }) => {
    attachConsoleSentinel(page, consoleErrors);
    consoleErrors.length = 0;
  });

  test.afterEach(() => {
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("landing map", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("citycut.view3d.quality", "high");
      window.__citycutMinSilentLoadMs = 0;
    });
    await page.goto(`?${CLEELAND_CUT.searchParams}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForSelector("button.create-fab", { timeout: 120_000 });
    await page.waitForTimeout(2_500);
    await expect(page).toHaveScreenshot("landing-map.png", { maxDiffPixelRatio: LANDING_MAX_DIFF });
  });

  test("3D model view", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("citycut.view3d.quality", "high");
      window.localStorage.setItem("citycut.wind.animateAnyway", "0");
      window.__citycutMinSilentLoadMs = 0;
    });
    const url = `?${CLEELAND_CUT.searchParams}&qa=1&view=persp`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator("button.create-fab").click({ timeout: 60_000 });
    await modelReady(page);
    await waitForWebGlCanvas(page);
    await introDone(page);
    await page.waitForFunction(() => typeof window.__citycutQa?.setCamera === "function", { timeout: 120_000 });
    await page.evaluate((pose) => {
      window.__citycutQa?.setCamera(pose);
    }, FIXED_CAMERA);
    await page.waitForTimeout(5_000);
    await expect(page.locator(".model .viewport")).toHaveScreenshot("model-3d.png", {
      maxDiffPixelRatio: MODEL_3D_MAX_DIFF,
      timeout: 120_000,
    });
  });

  test("Drawing view", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("citycut.view3d.quality", "high");
      window.localStorage.setItem("citycut.wind.animateAnyway", "0");
      window.__citycutMinSilentLoadMs = 0;
    });
    const url = `?${CLEELAND_CUT.searchParams}&qa=1&view=persp`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator("button.create-fab").click({ timeout: 60_000 });
    await modelReady(page);
    await waitForWebGlCanvas(page);
    await introDone(page);
    await activateModelTab(page, "Drawing");
    await page.waitForSelector("svg.plan", { timeout: 120_000 });
    await page.waitForTimeout(500);
    await expect(page.locator(".model")).toHaveScreenshot("drawing-view.png", {
      maxDiffPixelRatio: DRAWING_MAX_DIFF,
    });
  });
});