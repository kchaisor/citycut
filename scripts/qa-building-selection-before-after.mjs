/**
 * Before/after selection proof: tall tower, aerial 3/4, popover hidden, crop.
 * npx vite-node scripts/qa-building-selection-before-after.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const beforePath = `${outDir}/qa-melbourne-selection-before.png`;
const afterPath = `${outDir}/qa-melbourne-selection-after.png`;
const cropPath = `${outDir}/qa-melbourne-selection-after-crop.png`;
const auditPath = `${outDir}/qa-melbourne-selection-before-after-audit.json`;

const url =
  "http://127.0.0.1:4173/citycut/?qa=1&qaHidePopover=1&lat=-37.8136&lon=144.9631&km=0.5";

function auditOk(audit) {
  if (!audit) return false;
  const hidden = audit.hiddenMeshCount > 0 || audit.zeroedGroupCount > 0;
  return (
    hidden &&
    audit.visibleGroupCount === 0 &&
    audit.overlayFillTransparent &&
    Math.abs(audit.overlayFillOpacity - 0.5) < 0.02 &&
    audit.overlayDashedLineCount > 0 &&
    audit.overlayLineDistancesReady
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
await page.locator(".viewport-hint").waitFor({ timeout: 180_000 });
await page.waitForTimeout(2500);
for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");

await page.waitForFunction(() => window.__citycutQaModel?.pickTallTowerForSelectionQa != null, null, {
  timeout: 60_000,
});

const buildingId = await page.evaluate(() => {
  const id = window.__citycutQaModel?.pickTallTowerForSelectionQa?.() ?? null;
  if (id != null) window.__citycutQaModel?.clearHeightSelection?.();
  return id;
});
if (buildingId == null) throw new Error("No 40 m+ tower found for QA");

await page.evaluate(
  ([id]) => window.__citycutQaModel?.frameAerialSelectionBuilding?.(id),
  [buildingId],
);
await page.waitForTimeout(1200);

const cameraBefore = await page.evaluate(() => window.__citycutQa?.getCamera?.() ?? null);
await page.screenshot({ path: beforePath, fullPage: false });

await page.evaluate(
  ([id]) => window.__citycutQaModel?.selectHeightEditBuilding?.(id),
  [buildingId],
);
if (cameraBefore) {
  await page.evaluate(
    (pose) => window.__citycutQa?.setCamera?.(pose),
    cameraBefore,
  );
}
await page.waitForTimeout(1200);

let audit = await page.evaluate(() => window.__citycutQaSelectionAudit ?? null);
if (!auditOk(audit)) {
  await page.waitForTimeout(800);
  audit = await page.evaluate(() => window.__citycutQaSelectionAudit ?? null);
}

const meta = await page.evaluate(
  ([id]) => {
    const row = window.__citycutQaModel?.listBuildings?.().find((item) => item.id === id);
    return row ?? null;
  },
  [buildingId],
);
writeFileSync(
  auditPath,
  JSON.stringify({ buildingId, meta, cameraBefore, audit }, null, 2),
);
if (!auditOk(audit)) throw new Error(`Selection audit failed: ${JSON.stringify(audit)}`);

await page.screenshot({ path: afterPath, fullPage: false });

const clip = await page.evaluate(
  ([id]) => window.__citycutQaModel?.selectionScreenClip?.(id, 64) ?? null,
  [buildingId],
);
if (clip && clip.width > 40 && clip.height > 40) {
  await page.screenshot({ path: cropPath, clip });
} else {
  console.warn("Clip fallback centre crop");
  await page.screenshot({
    path: cropPath,
    clip: { x: 420, y: 120, width: 420, height: 520 },
  });
}

console.log("Saved", beforePath);
console.log("Saved", afterPath);
console.log("Saved", cropPath);
await browser.close();
