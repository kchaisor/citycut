import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ARTIFACTS = "/opt/cursor/artifacts";
mkdirSync(ARTIFACTS, { recursive: true });
const BASE = "http://127.0.0.1:4173";

const SITES = [
  {
    name: "dandenong",
    url: `${BASE}/citycut/?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1`,
  },
  {
    name: "melbourne-cbd",
    url: `${BASE}/citycut/?lat=-37.8136&lon=144.9631&shape=a3&a3scale=2500&a3ori=landscape&km=1.05&label=Melbourne%20CBD`,
  },
];

async function waitForPreview() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/citycut/`);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("preview server not ready");
}

async function openModel(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const create = page.locator("button.create-fab");
  if (await create.count()) {
    await create.click({ timeout: 60_000 });
  }
  await page.waitForSelector(".model", { timeout: 180_000 });
  await page.waitForTimeout(2000);
}

async function openAnalysisWind(page) {
  await page.locator('.model button[data-section="analysis"]').first().click({ timeout: 120_000 });
  await page.getByRole("tab", { name: /Wind Rose/i }).click();
  await page.waitForSelector(".wind-rose-analysis-card", { timeout: 120_000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector(".model");
      return root?.getAttribute("data-wind-station") && root?.getAttribute("data-ground-wind-deg");
    },
    null,
    { timeout: 120_000 },
  );
}

async function assertRose(page) {
  const meta = await page.evaluate(() => {
    const root = document.querySelector(".model");
    return {
      station: root?.getAttribute("data-wind-station") ?? "",
      distanceKm: root?.getAttribute("data-wind-distance-km") ?? "",
      period: root?.getAttribute("data-wind-period") ?? "",
      calmCaption: document.querySelector(".wind-rose-calm-caption")?.textContent ?? "",
      caption: document.querySelector(".wind-rose-meta")?.textContent ?? "",
      note: document.querySelector(".wind-rose-meta-note")?.textContent ?? "",
    };
  });
  if (!meta.station || !meta.distanceKm || !meta.period) throw new Error(`missing station meta: ${JSON.stringify(meta)}`);
  if (!meta.note.includes("Regional station wind")) throw new Error("missing regional note");
  if (!/^Calm \d+\.\d%/.test(meta.calmCaption)) throw new Error(`missing calm caption: ${meta.calmCaption}`);
  if (meta.caption.includes("N,") || meta.caption.includes("NNE")) throw new Error("prevailing should not be in card caption");
  return meta;
}

const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
  cwd: "/agent/repos/citycut",
  stdio: "ignore",
});
await waitForPreview();

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.addInitScript(() => {
    window.__citycutMinSilentLoadMs = 550;
    try {
      window.localStorage.setItem(
        "citycut.view",
        JSON.stringify({ projection: "iso", corner: "sw", freeRotate: false }),
      );
    } catch {
    }
  });

  for (const site of SITES) {
    for (const width of [1024, 1280, 1440]) {
      for (const season of ["annual", "winter"]) {
        const page = await context.newPage({ viewport: { width, height: 900 } });
        page.setDefaultTimeout(180_000);
        await openModel(page, site.url);
        await openAnalysisWind(page);
        if (season === "winter") {
          await page.getByRole("button", { name: "Winter", exact: true }).click();
          await page.waitForTimeout(400);
        }
        if (season === "winter") {
          await page.getByRole("button", { name: "Annual", exact: true }).click();
          await page.waitForTimeout(300);
          const annualCalm = await page.locator(".wind-rose-calm-caption").textContent();
          await page.getByRole("button", { name: "Winter", exact: true }).click();
          await page.waitForTimeout(350);
          const winterCalm = await page.locator(".wind-rose-calm-caption").textContent();
          const seasonAttr = await page.getAttribute(".model", "data-ground-wind-season");
          if (seasonAttr !== "winter") throw new Error(`season attr not winter: ${seasonAttr}`);
          if (site.name === "melbourne-cbd" && (!annualCalm || !winterCalm || annualCalm === winterCalm)) {
            throw new Error(`season toggle failed at ${site.name}: annual=${annualCalm} winter=${winterCalm}`);
          }
        }
        const meta = await assertRose(page);
        const shot = path.join(ARTIFACTS, `wind-rose-${site.name}-${season}-${width}.png`);
        await page.screenshot({ path: shot, fullPage: false });
        console.log(JSON.stringify({ site: site.name, season, width, shot, meta }));
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  preview.kill("SIGTERM");
}