import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PREVIEW_BASE = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-anchored-lens-kchai.vercel.app/";
const SHARE = process.env.CITYCUT_PREVIEW_SHARE ?? "";
const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };

function previewUrl() {
  const u = new URL(PREVIEW_BASE);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", "-37.8136");
  u.searchParams.set("lon", "144.9831");
  u.searchParams.set("km", "1");
  if (SHARE) u.searchParams.set("_vercel_share", SHARE.replace(/^_vercel_share=/, ""));
  return u.toString();
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
  } catch {
    // ignore
  }
});
const page = await context.newPage();
await page.goto(previewUrl(), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.click("button.create-fab");
await page.waitForFunction(() => Boolean(window.__citycutQaModel?.findTallBuildingForLensQa), { timeout: 180000 });
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(1500);

const target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!target) throw new Error("No lens QA building target");

const pinClick = await page.evaluate(
  (id) => window.__citycutQaModel?.resolveLensBuildingClick?.(id) ?? null,
  target.id,
);
if (pinClick) {
  await page.mouse.move(pinClick.clickX, pinClick.clickY);
  await page.waitForTimeout(300);
  await page.mouse.click(pinClick.clickX, pinClick.clickY);
} else {
  const opened = await page.evaluate(
    (id) => window.__citycutQaModel?.openAnchoredLensForBuilding?.(id) ?? 0,
    target.id,
  );
  if (!opened) throw new Error("Could not open anchored lens");
}

await page.waitForSelector('[data-anchored-lens="open"]', { timeout: 20000 });
await page.waitForFunction(
  () => window.__citycutQaModel?.getAnchoredLensMode?.() === "pinned",
  { timeout: 15000 },
);
await page.waitForTimeout(400);

const rippleBtn = page.locator('[data-anchored-lens-action="ripple"]');
await rippleBtn.waitFor({ state: "visible", timeout: 10000 });
await rippleBtn.hover({ force: true });
await page.waitForTimeout(200);
const rippleTitle = await rippleBtn.getAttribute("title");
if (rippleTitle === "Coming soon") throw new Error("Ripple from here still shows Coming soon");

await rippleBtn.click({ force: true });
await page.waitForFunction(
  () => {
    const tab = document.querySelector('.model .env-mode-btn[aria-selected="true"]');
    return tab?.textContent?.includes("Walk Ripple") ?? false;
  },
  { timeout: 20000 },
);
await page.waitForFunction(
  () => {
    const track = document.querySelector(".model .walk-ripple-scrubber-track");
    return track && track.getAttribute("aria-disabled") === "false";
  },
  { timeout: 120000 },
);
await page.waitForTimeout(4200);

const outPath = path.join(OUT, "anchored-lens-ripple-from-here.png");
await page.screenshot({ path: outPath, fullPage: false });
console.log(`Wrote ${outPath}`);

await browser.close();
