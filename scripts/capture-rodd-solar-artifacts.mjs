import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "/opt/cursor/artifacts";
const PREVIEW =
  process.env.CITYCUT_PREVIEW_BASE ??
  "http://127.0.0.1:4173/citycut";
const QUERY =
  "?qa=1&lat=-33.866498&lon=151.18355&km=1&label=Rodd+Point+NSW&view=iso-se&solar=path";

fs.mkdirSync(OUT, { recursive: true });

function sunPathInViewBox(svgText) {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
  if (!vb) return { inView: 0, total: 0, ratio: 0 };
  const w = Number(vb[1]);
  const h = Number(vb[2]);
  const nums = [...svgText.matchAll(/(?:^|[\s,])(-?\d+\.?\d*) (-?\d+\.?\d*)(?=[\s"])/gm)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  let inView = 0;
  for (const [x, y] of nums) {
    if (x >= 0 && x <= w && y >= 0 && y <= h) inView += 1;
  }
  return { inView, total: nums.length, ratio: nums.length ? inView / nums.length : 0, w, h };
}

async function waitReady(page) {
  await page.goto(`${PREVIEW}${QUERY}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: /^Create model$/i }).click({ timeout: 60_000 });
  await page.locator(".model").waitFor({ state: "visible", timeout: 600_000 });
  await page.locator(".studio-status-pill").filter({ hasText: /Ready/i }).waitFor({ timeout: 600_000 });
  await page.locator(".viewport canvas").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(8000);
}

async function solarStudyOn(page) {
  await page.locator('.model button[data-section="analysis"]').first().click({ timeout: 30_000 });
  await page.locator(".env-console").waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(400);
  const sunDome = page.getByRole("button", { name: "3D Sun Dome" });
  const shadows = page.getByRole("button", { name: "Shadows" });
  if ((await sunDome.getAttribute("aria-pressed")) !== "true") await sunDome.click();
  if ((await shadows.getAttribute("aria-pressed")) !== "true") await shadows.click();
  await page.getByRole("button", { name: "21 Jun" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "Solar time 15:00" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
}

async function downloadSvg(page, buttonLabel) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.getByRole("button", { name: buttonLabel }).click(),
  ]);
  const file = path.join(OUT, await download.suggestedFilename());
  await download.saveAs(file);
  return file;
}

async function renderSvgPng(page, svgPath, pngPath) {
  const svg = fs.readFileSync(svgPath, "utf8");
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;background:#e8e4dc}svg{width:1440px;height:auto;display:block;margin:0 auto}</style></head><body>${svg}</body></html>`,
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: pngPath, fullPage: true });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);

try {
  await waitReady(page);
  await solarStudyOn(page);
  await page.screenshot({ path: `${OUT}/on-screen-3d-solar-rodd-point.png` });

  const viewSvgPath = await downloadSvg(page, "Quick export SVG");
  fs.renameSync(viewSvgPath, `${OUT}/rodd-3d-view-solar.svg`);

  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.waitForSelector("svg.plan", { timeout: 60_000 });
  await page.waitForTimeout(2000);
  const drawSvgPath = await downloadSvg(page, "Quick export SVG");
  fs.renameSync(drawSvgPath, `${OUT}/rodd-drawing-solar-fixed.svg`);
  await page.screenshot({ path: `${OUT}/drawing-tab-rodd-on-screen.png`, fullPage: false });

  const renderPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await renderSvgPng(renderPage, `${OUT}/rodd-3d-view-solar.svg`, `${OUT}/3d-view-svg-sun-dome-shadows.png`);
  await renderSvgPng(renderPage, `${OUT}/rodd-drawing-solar-fixed.svg`, `${OUT}/drawing-svg-shadows-under-buildings.png`);
  await renderPage.close();

  const viewSvg = fs.readFileSync(`${OUT}/rodd-3d-view-solar.svg`, "utf8");
  const drawSvg = fs.readFileSync(`${OUT}/rodd-drawing-solar-fixed.svg`, "utf8");
  const viewStats = sunPathInViewBox(viewSvg);
  const drawOrder =
    drawSvg.indexOf('inkscape:label="Shadows"') >= 0 && drawSvg.indexOf('inkscape:label="Buildings"') >= 0
      ? drawSvg.indexOf('inkscape:label="Shadows"') < drawSvg.indexOf('inkscape:label="Buildings"')
      : false;

  console.log(
    JSON.stringify(
      {
        preview: PREVIEW,
        viewHasSunPath: viewSvg.includes("Sun path"),
        viewHasShadows: viewSvg.includes("Shadows"),
        viewSunPathInViewBox: viewStats,
        drawingShadowsBeforeBuildings: drawOrder,
        bytes: {
          view: viewSvg.length,
          drawing: drawSvg.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
