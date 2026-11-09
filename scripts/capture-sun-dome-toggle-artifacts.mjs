import fs from "node:fs";
import { chromium } from "playwright";

const OUT = "/opt/cursor/artifacts";
const PREVIEW =
  process.env.CITYCUT_PREVIEW_BASE ?? "http://127.0.0.1:4173/citycut";
const QUERY = "?qa=1&lat=-33.866498&lon=151.18355&km=1&label=Rodd+Point+NSW&view=iso-se";

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(`${PREVIEW}${QUERY}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const create = page.getByRole("button", { name: /^Create model$/i });
  if (await create.isVisible({ timeout: 8000 }).catch(() => false)) await create.click({ timeout: 120_000 });
  await page.locator(".model").waitFor({ state: "visible", timeout: 600_000 });
  await page.locator(".studio-status-pill").filter({ hasText: /Ready/i }).waitFor({ timeout: 600_000 });
  await page.waitForTimeout(5000);

  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.waitForTimeout(500);
  await page.locator('.model button[data-section="analysis"]').first().click();
  await page.locator(".env-console").waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  const bar = page.locator(".model .bottom-bar.env-console");
  await bar.screenshot({ path: `${OUT}/drawing-solar-bar-sun-dome-toggle.png` });

  const sunDome = page.locator(".model .env-console .overlay-chips button", { hasText: "Sun dome" });
  if ((await sunDome.getAttribute("aria-pressed")) !== "true") await sunDome.click();
  await page.waitForTimeout(300);
  await sunDome.click();
  await page.waitForTimeout(400);

  await page.getByRole("tab", { name: /3D model/i }).click();
  await page.waitForFunction(
    () => (window.__citycutQa?.heliodonInScene?.() ?? false) === false,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1500);
  await page.locator(".model .viewport").screenshot({ path: `${OUT}/3d-view-sun-dome-off.png` });
} finally {
  await browser.close();
}
