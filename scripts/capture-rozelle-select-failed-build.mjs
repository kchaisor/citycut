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
  page.setDefaultTimeout(120_000);

  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (/pmtiles|overture|building-enrichment/i.test(url)) {
        throw new TypeError("network down");
      }
      return nativeFetch(input, init);
    };
  });

  await page.goto(CANONICAL, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: /^Create model$/i }).click();
  await page.waitForFunction(
    () => {
      const app = document.querySelector(".app");
      const active = app?.getAttribute("data-site-build-active");
      const create = document.querySelector(".select button")?.textContent ?? "";
      const alert = document.querySelector('[role="alert"]');
      return active == null && /create model/i.test(create) && alert != null;
    },
    { timeout: 180_000 },
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
