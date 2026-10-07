/**
 * QA: 50% selected building with dashed outline — two camera angles.
 * npx vite-node scripts/qa-building-selection-3d-click.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const shotThrough = `${outDir}/qa-melbourne-building-selection-through.png`;
const shotOblique = `${outDir}/qa-melbourne-building-selection-oblique.png`;
const auditPath = `${outDir}/qa-melbourne-building-selection-audit.json`;

const url = "http://127.0.0.1:4173/citycut/?qa=1&lat=-37.8136&lon=144.9631&km=0.5";

function auditOk(audit) {
  if (!audit) return false;
  const hidden = audit.hiddenMeshCount > 0 || audit.zeroedGroupCount > 0;
  return (
    hidden &&
    audit.visibleGroupCount === 0 &&
    audit.overlayInScene &&
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
const logs = [];
page.on("console", (msg) => {
  if (msg.text().includes("[CityCut selection]")) logs.push(msg.text());
});

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
await page.locator(".viewport-hint").waitFor({ timeout: 180_000 });
await page.waitForTimeout(2500);
for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");

await page.waitForFunction(() => window.__citycutQaModel?.pickForegroundBuildingForSelectionQa != null, null, {
  timeout: 60_000,
});

const buildingId = await page.evaluate(() => {
  const id = window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.() ?? null;
  return id;
});
if (buildingId == null) throw new Error("No suitable foreground building for QA");

await page.waitForTimeout(800);
let audit = await page.evaluate(() => window.__citycutQaSelectionAudit ?? null);
if (!auditOk(audit)) {
  await page.waitForTimeout(600);
  audit = await page.evaluate(() => window.__citycutQaSelectionAudit ?? null);
}
writeFileSync(auditPath, JSON.stringify({ buildingId, audit, logs }, null, 2));
if (!auditOk(audit)) {
  throw new Error(`Selection audit failed: ${JSON.stringify(audit)}`);
}

await page.evaluate(
  ([id]) => window.__citycutQaModel?.frameSelectionBuilding?.(id, "through"),
  [buildingId],
);
await page.waitForTimeout(900);
await page.screenshot({ path: shotThrough, fullPage: false });

await page.evaluate(
  ([id]) => window.__citycutQaModel?.frameSelectionBuilding?.(id, "oblique"),
  [buildingId],
);
await page.waitForTimeout(900);
await page.screenshot({ path: shotOblique, fullPage: false });

console.log("Saved", shotThrough);
console.log("Saved", shotOblique);
console.log("Audit", auditPath);
await browser.close();
