import type { Page } from "@playwright/test";

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