/**
 * QA: drifting wind arrows — two canvas shots 2 s apart at Mont Albert.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const QUERY =
  "?lat=-37.8155&lon=145.1050&km=1&siteLat=-37.8155&siteLon=145.1050&qa=1";

const cameraPose = {
  eye: { x: -320, y: 280, z: -320 },
  look: { x: 0, y: 8, z: 0 },
};

function diffPngBuffers(a, b) {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
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

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto(`http://127.0.0.1:4173/citycut-export/${QUERY}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(5000);

await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.getByLabel("Wind on").check();
await page.locator(".wind-drawer select").selectOption("annual");
await page.waitForTimeout(16000);

await page.keyboard.press("Escape");
await page.waitForTimeout(300);

await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
await page.evaluate((p) => {
  window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
}, cameraPose);
await page.waitForTimeout(2500);

const canvas = page.locator(".viewport canvas");
const t0Path = `${outDir}/wind-drift-t0.png`;
const t2Path = `${outDir}/wind-drift-t2.png`;

const t0 = await canvas.screenshot();
writeFileSync(t0Path, t0);
const headsT0 = await page.evaluate(() => window.__citycutQaWind?.getHeadPositionsM?.() ?? null);

await page.waitForTimeout(2000);

const t2 = await canvas.screenshot();
writeFileSync(t2Path, t2);
const headsT2 = await page.evaluate(() => window.__citycutQaWind?.getHeadPositionsM?.() ?? null);

const { changedPixels, totalPixels } = diffPngBuffers(t0, t2);

await browser.close();

console.log(
  JSON.stringify(
    {
      changedPixels,
      totalPixels,
      fraction: changedPixels / totalPixels,
      t0Path,
      t2Path,
      headsT0,
      headsT2,
    },
    null,
    2,
  ),
);
