import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = process.env.CITYCUT_BASE ?? "http://127.0.0.1:4173/citycut/";
const origin = { lon: 144.98038, lat: -37.81356 };
const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/__fixtures__/east-melbourne-import-massing.3dm",
);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const modelUrl = `${base}?qa=1&view=persp&lat=${origin.lat}&lon=${origin.lon}&km=0.3`;
await page.goto(modelUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForTimeout(5000);

await page.getByRole("button", { name: "Import", exact: true }).click();
const fileInput = page.locator('input[type="file"][accept=".3dm"]');
await fileInput.setInputFiles(fixturePath);
await page.waitForSelector("text=east-melbourne-import-massing.3dm", { timeout: 120_000 });
await page.waitForTimeout(4000);

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/imported-massing-site-plan.png`, fullPage: false });

await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/imported-massing-exploded-axo.png`, fullPage: false });

const axoSvg = page.getByRole("img", { name: "Exploded axonometric drawing" });
if (await axoSvg.count()) {
  const box = await axoSvg.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${outDir}/imported-massing-exploded-axo-crop.png`,
      clip: {
        x: box.x + box.width * 0.25,
        y: box.y + box.height * 0.15,
        width: box.width * 0.5,
        height: box.height * 0.7,
      },
    });
  }
}

await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(1500);
const planSvg = page.getByRole("img", { name: "Vector site plan" });
if (await planSvg.count()) {
  const planBox = await planSvg.boundingBox();
  if (planBox) {
    await page.screenshot({
      path: `${outDir}/imported-massing-site-plan-crop.png`,
      clip: {
        x: planBox.x + planBox.width * 0.35,
        y: planBox.y + planBox.height * 0.3,
        width: planBox.width * 0.3,
        height: planBox.height * 0.4,
      },
    });
  }
}

await browser.close();
console.log("Screenshots written to", outDir);
