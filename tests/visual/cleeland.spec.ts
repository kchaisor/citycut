import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  activateModelTab,
  attachConsoleSentinel,
  CLEELAND_CUT,
  introDone,
  modelReady,
  applyAppDefaultOverviewCamera,
  waitForModelSceneSettled,
  waitForWebGlCanvas,
} from "./cleelandFlow";

const LANDING_MAX_DIFF = 0.02;
const DRAWING_MAX_DIFF = 0.02;
const MODEL_3D_MAX_DIFF = 0.06;
const PR_SHOTS_DIR = "pr-screenshots";

async function savePrShot(target: Page | Locator, name: string) {
  await target.screenshot({ path: `${PR_SHOTS_DIR}/${name}`, animations: "disabled", caret: "hide" });
}

async function savePrShots(page: Page, target: Page | Locator, name: string) {
  await savePrShot(page, name);
  await savePrShot(target, `baseline-${name}`);
}

test.describe.configure({ mode: "default" });

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
    await savePrShots(page, page, "landing-map.png");
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
    await waitForModelSceneSettled(page);
    await applyAppDefaultOverviewCamera(page);
    await savePrShots(page, page.locator(".scene-viewport"), "model-3d.png");
    await expect(page.locator(".scene-viewport")).toHaveScreenshot("model-3d.png", {
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
    await savePrShots(page, page.locator(".model"), "drawing-view.png");
    await expect(page.locator(".model")).toHaveScreenshot("drawing-view.png", {
      maxDiffPixelRatio: DRAWING_MAX_DIFF,
    });
  });
});