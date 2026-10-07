/**
 * CBD manual-height before/after screenshots with locked camera.
 * Run: npx vite-node scripts/qa-manual-height-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tallestExtrusionHeight } from "../src/lib/comBuildingHeightsMatch.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import {
  clearComBuildingFootprintCache,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { squareBBox, openRing } from "../src/lib/geo.ts";
import {
  applyOverrideToBuilding,
  buildingHeightSource,
  buildingHeightSourceLabel,
} from "../src/lib/heightOverrides.ts";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import * as THREE from "three";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 600;
const NEW_HEIGHT = 120;
const EYE_Y = 350;
const HORIZONTAL_BACK_M = 400;
const DEPRESSION_DEG = 35;

function ringCentroid(ring) {
  const points = openRing(ring);
  let east = 0;
  let north = 0;
  for (const [x, y] of points) {
    east += x;
    north += y;
  }
  return [east / points.length, north / points.length];
}

function nearbyTallMax(buildings, east, north, radiusM) {
  let max = 0;
  for (const b of buildings) {
    const [cx, cy] = ringCentroid(b.ring);
    if (Math.hypot(cx - east, cy - north) > radiusM) continue;
    max = Math.max(max, tallestExtrusionHeight(b));
  }
  return max;
}

function pickBuilding(buildings) {
  const candidates = buildings
    .map((b) => {
      const h = tallestExtrusionHeight(b);
      const [east, north] = ringCentroid(b.ring);
      const dist = Math.hypot(east, north);
      const localTall = nearbyTallMax(buildings, east, north, 45);
      return { b, h, east, north, dist, localTall };
    })
    .filter((c) => c.h < 20 && c.h > 2 && c.dist >= 70 && c.dist <= 220 && c.localTall < 55);

  candidates.sort((a, b) => a.h - b.h || a.localTall - b.localTall);
  if (candidates.length === 0) throw new Error("No suitable building under 20 m");
  const pick = candidates[0];
  return pick;
}

function worldTarget(building, heightM) {
  const [east, north] = ringCentroid(building.ring);
  const z = -north;
  const y = heightM / 2;
  return { east, north, x: east, y, z, heightM };
}

function cameraPose(target) {
  const back = HORIZONTAL_BACK_M;
  const dy = EYE_Y - target.y;
  const angleRad = (DEPRESSION_DEG * Math.PI) / 180;
  const horizontal = dy / Math.tan(angleRad);
  const scale = horizontal / back;
  const eye = {
    x: target.x - back * 0.707106 * scale,
    y: EYE_Y,
    z: target.z - back * 0.707106 * scale,
  };
  const look = { x: target.x, y: target.y, z: target.z };
  return { eye, look };
}

/** Same meshes `cityModelTo3dm` extrudes; Rhino Z equals this Y. */
function exportMeshTopM(building, heightM) {
  const overridden = applyOverrideToBuilding(building, heightM);
  const model = {
    placeLabel: "CBD QA",
    center,
    sideM,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings: [overridden],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "qa",
    manualHeightEditCount: 1,
  };
  const group = buildCityGroup(model, { splitBuildings: true });
  const box = new THREE.Box3().setFromObject(group);
  disposeObject(group);
  return box.max.y;
}

const cutBounds = squareBBox(center, sideM);
const bounds = paddedComFetchBounds(center, sideM);
const { buildings } = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
clearComBuildingFootprintCache();
const { footprints } = await fetchComBuildingFootprintsWithStats(bounds, center);
const { buildings: frameBuildings } = await runComBuildingHeightsInWorker(buildings, footprints);

const pick = pickBuilding(frameBuildings);
const building = pick.b;
const beforeHeight = tallestExtrusionHeight(building);
const sourceLabel = buildingHeightSourceLabel(buildingHeightSource(building));
const targetBefore = worldTarget(building, beforeHeight);
const targetAfter = worldTarget(building, NEW_HEIGHT);
const pose = cameraPose(targetAfter);

const rhinoExportTopM = exportMeshTopM(building, NEW_HEIGHT);

const reportPath = `${outDir}/cbd-height-report.json`;
const report = {
  buildingId: building.id,
  centroidEastM: pick.east,
  centroidNorthM: pick.north,
  heightBeforeM: beforeHeight,
  sourceBefore: sourceLabel,
  heightAfterM: NEW_HEIGHT,
  camera: pose,
  rhinoExportTopM,
  frameBuilding: building,
};

writeFileSync(reportPath, JSON.stringify(report, null, 2));

execSync(`npm test -- scripts/qa-rhino-building-height.test.ts`, {
  cwd: "/workspace",
  env: { ...process.env, QA_BUILDING_JSON: reportPath },
  stdio: "inherit",
});

const url =
  "http://localhost:5173/citycut/?lat=-37.8136&lon=144.9631&km=0.6&label=CBD&view=persp&qa=1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  window.localStorage.removeItem("citycut.heightOverrides");
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

await page.getByRole("button", { name: "Layers" }).click();
const treesToggle = page.getByRole("button", { name: "Trees", exact: true });
if ((await treesToggle.getAttribute("aria-pressed")) === "true") await treesToggle.click();

await page.getByRole("button", { name: "Create model" }).click();
await page.waitForSelector(".scene-canvas canvas", { timeout: 240_000 });
await page.waitForTimeout(3000);

async function openBuildingsDrawer() {
  const rail = page.locator('button.rail-btn[aria-label="Buildings"]');
  const expanded = await rail.getAttribute("aria-expanded");
  if (expanded !== "true") await rail.click();
  await page.locator(".height-override-panel .legend-note").waitFor({ timeout: 15_000 });
}

async function setCamera(pose) {
  await page.waitForFunction(() => window.__citycutQa?.setCamera);
  await page.evaluate((p) => {
    window.__citycutQa.setCamera({ eye: p.eye, target: p.look });
    window.__qaCameraLock = JSON.parse(JSON.stringify(p));
  }, pose);
  await page.waitForTimeout(600);
}

async function reapplyCameraLock() {
  await page.evaluate(() => {
    const p = window.__qaCameraLock;
    if (p) window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
  });
  await page.waitForTimeout(400);
}

async function screenPointForBuilding(pose, world) {
  await page.evaluate((p) => {
    window.__citycutQa.setCamera({ eye: p.eye, target: p.look });
  }, pose);
  return page.evaluate((w) => window.__citycutQa.projectToScreen(w), world);
}

await openBuildingsDrawer();
await setCamera(pose);
await page.waitForFunction(() => document.body.innerText.includes("0 manual height"));
await page.screenshot({ path: `${outDir}/cbd-height-before.png`, fullPage: false });

const clickPt = await screenPointForBuilding(pose, {
  x: targetAfter.x,
  y: Math.max(beforeHeight * 0.35, 3),
  z: targetAfter.z,
});

await page.mouse.click(clickPt.x, clickPt.y);
await page.locator(".building-height-popover").waitFor({ timeout: 8000 });
const input = page.locator(".building-height-popover input[type='number']");
await input.fill(String(NEW_HEIGHT));
await page.getByRole("button", { name: "Save" }).click();
await page.waitForFunction(() => document.body.innerText.match(/1 manual height/i));
await page.waitForTimeout(800);

await reapplyCameraLock();
await openBuildingsDrawer();

await page.mouse.click(clickPt.x, clickPt.y);
await page.locator(".building-height-popover").waitFor({ timeout: 8000 });
await reapplyCameraLock();
await page.waitForTimeout(300);

await page.screenshot({ path: `${outDir}/cbd-height-after.png`, fullPage: false });

console.log(JSON.stringify({ ...report, before: `${outDir}/cbd-height-before.png`, after: `${outDir}/cbd-height-after.png` }, null, 2));

await browser.close();
