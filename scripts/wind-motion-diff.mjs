/**
 * Headless wind streak motion check: two canvas screenshots ~1s apart, pixel diff count.
 * Usage: node scripts/wind-motion-diff.mjs [--base=/citycut-export/] [--out=label]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const QUERY =
  "?qa=1&buildings=uniform&lat=-37.8155&lon=145.1050&km=1&siteLat=-37.8155&siteLon=145.1050";
const baseArg = process.argv.find((a) => a.startsWith("--base="));
const labelArg = process.argv.find((a) => a.startsWith("--out="));
const reducedMotion = process.argv.includes("--reduced-motion");
const animateAnyway = process.argv.includes("--animate-anyway");
const basePath = baseArg ? baseArg.slice("--base=".length) : "/citycut-export/";
const label = labelArg ? labelArg.slice("--out=".length) : "main";

const cameraPose = {
  eye: { x: -280, y: 220, z: -280 },
  look: { x: 0, y: 6, z: 0 },
};

function diffPngBuffers(a, b) {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new Error(`size mismatch ${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}`);
  }
  let changed = 0;
  const dataA = imgA.data;
  const dataB = imgB.data;
  for (let i = 0; i < dataA.length; i += 4) {
    if (
      dataA[i] !== dataB[i] ||
      dataA[i + 1] !== dataB[i + 1] ||
      dataA[i + 2] !== dataB[i + 2] ||
      dataA[i + 3] !== dataB[i + 3]
    ) {
      changed++;
    }
  }
  return { changedPixels: changed, totalPixels: dataA.length / 4 };
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  if (reducedMotion || animateAnyway) {
    await context.addInitScript((anyway) => {
      localStorage.setItem("citycut.wind.enabled", "1");
      localStorage.setItem("citycut.wind.showRose", "1");
      if (anyway) localStorage.setItem("citycut.wind.animateAnyway", "1");
    }, animateAnyway);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(300_000);

  await page.goto(`http://127.0.0.1:4173${basePath}${QUERY}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  await page.waitForTimeout(5000);

  await page.getByRole("button", { name: "Wind", exact: true }).click();
  await page.getByLabel("Wind on").check();
  await page.locator(".wind-drawer select").selectOption("annual");
  await page.waitForTimeout(16000);

  await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
  await page.evaluate((p) => {
    window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
  }, cameraPose);
  await page.waitForTimeout(2000);

  const canvas = page.locator(".viewport canvas");
  const t0Path = `${outDir}/wind-t0-${label}.png`;
  const t1Path = `${outDir}/wind-t1-${label}.png`;
  const t0 = await canvas.screenshot();
  writeFileSync(t0Path, t0);
  await page.waitForTimeout(1000);
  const t1 = await canvas.screenshot();
  writeFileSync(t1Path, t1);

  if (reducedMotion) {
    const rmPath =
      label === "after-fix" ? `${outDir}/wind-reduced-motion.png` : `${outDir}/wind-reduced-motion-${label}.png`;
    writeFileSync(rmPath, t0);
    const caption = await page.locator(".wind-reduced-motion-note").count();
    let overrideDiff = null;
    if (animateAnyway) {
      const t2 = await canvas.screenshot();
      const diff = diffPngBuffers(t0, t2);
      overrideDiff = diff.changedPixels;
    }
    await browser.close();
    console.log(
      JSON.stringify({ label, reducedMotion: true, captionBlocks: caption, overrideDiff, saved: rmPath }, null, 2),
    );
    return;
  }

  if (label === "after-fix") {
    writeFileSync(`${outDir}/wind-t0.png`, t0);
    writeFileSync(`${outDir}/wind-t1.png`, t1);
  }

  const { changedPixels, totalPixels } = diffPngBuffers(t0, t1);
  await browser.close();
  console.log(
    JSON.stringify(
      {
        label,
        changedPixels,
        totalPixels,
        fraction: changedPixels / totalPixels,
        t0: t0Path,
        t1: t1Path,
      },
      null,
      2,
    ),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
