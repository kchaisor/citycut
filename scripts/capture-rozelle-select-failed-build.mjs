import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const CANONICAL =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const WIDTH = Number(process.env.WIDTH ?? 1280);

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 800 } });
  page.setDefaultTimeout(180_000);

  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (
      /overture|pmtiles|building-enrichment|parquet|s3\.amazonaws\.com\/overture/i.test(url) &&
      route.request().resourceType() !== "document"
    ) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto(CANONICAL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const create =
    (await page.locator("button.create-fab").count()) > 0
      ? page.locator("button.create-fab")
      : page.getByRole("button", { name: /^Create model$/i });
  await create.click({ timeout: 60_000 });
  await page.waitForSelector('[role="alert"]', { timeout: 180_000 });
  await page.waitForFunction(
    () => document.querySelector(".app")?.getAttribute("data-site-build-active") == null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => {
      const btn =
        document.querySelector("button.create-fab") ??
        Array.from(document.querySelectorAll("button")).find((b) => /create model/i.test(b.textContent ?? ""));
      if (!btn) return false;
      const style = getComputedStyle(btn);
      return style.visibility !== "hidden" && Number(style.opacity) > 0.05;
    },
    { timeout: 30_000 },
  );

  const out = path.join(OUT_DIR, `rozelle-pr227-select-after-failed-build-${WIDTH}.png`);
  await page.screenshot({ path: out, fullPage: false });
  await browser.close();
  console.log(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
