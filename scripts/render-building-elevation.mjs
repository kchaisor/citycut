/**
 * Orthographic side elevation (three.js, looking north) for main vs PR building heights.
 * Usage: npm exec vite-node scripts/render-building-elevation.mjs
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { chromium } from "playwright";
import { squareBBox, openRing, signedArea } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "../src/lib/comDevelopmentFloors.ts";
import { buildingDisplayHeightM, buildingHeightSourceLabelForBuilding } from "../src/lib/heightOverrides.ts";
import { getColour } from "../src/lib/colours.ts";

const TARGET_ID = 551928359;
const NEIGHBOUR_M = 80;
const center = { lon: 144.98061, lat: -37.8127 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const comBounds = paddedComFetchBounds(center, sideM);

const { buildings: raw } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { zones } = await loadUseTiers(bounds, center);
const zoned = assignExternalUses(raw, zones);
const dam = await fetchDevelopmentFloorRecords(comBounds);
const mainBuildings = zoned;
const withDam = applyDevelopmentFloorsToBuildings(zoned, center, dam);
const { footprints } = await fetchComBuildingFootprintsWithStats(comBounds, center);
const { buildings: prBuildings } = applyComBuildingHeights(withDam, footprints);

function centroid(building) {
  const ring = openRing(building.ring);
  let e = 0;
  let n = 0;
  for (const [x, y] of ring) {
    e += x;
    n += y;
  }
  const c = ring.length || 1;
  return { east: e / c, north: n / c };
}

function packScene(buildings, targetId) {
  const target = buildings.find((b) => b.id === targetId);
  if (!target) throw new Error("target missing");
  const tc = centroid(target);
  const neighbours = buildings.filter((b) => {
    if (b.id === targetId) return false;
    const c = centroid(b);
    return Math.hypot(c.east - tc.east, c.north - tc.north) <= NEIGHBOUR_M;
  });
  const pick = [target, ...neighbours];
  const height = buildingDisplayHeightM(target);
  const source = buildingHeightSourceLabelForBuilding(target);
  return {
    targetId,
    label: `${height.toFixed(1)} m · ${source}`,
    civicHex: getColour("--use-civic"),
    neighbourHex: getColour("--use-unclassified"),
    buildings: pick.map((b) => ({
      id: b.id,
      isTarget: b.id === targetId,
      parts:
        b.extrusionParts?.length > 0
          ? b.extrusionParts.map((p) => ({ ring: p.ring, holes: p.holes, height: p.height }))
          : [{ ring: b.ring, holes: b.holes, height: b.height }],
    })),
  };
}

const scenes = {
  main: packScene(mainBuildings, TARGET_ID),
  pr: packScene(prBuildings, TARGET_ID),
};

const ARTIFACT_DIRS = ["/opt/cursor/artifacts", "/cursor/stores/self/artifacts"];
for (const dir of ARTIFACT_DIRS) mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

async function renderScene(scene, outPath) {
  await page.setContent(
    `<!doctype html><style>body{margin:0;background:#f5f3ee;font:18px sans-serif;color:#1a1a1a}.cap{padding:12px 16px}</style>
<div class="cap"><div id="label"></div><div style="font-size:14px;margin-top:4px">Side elevation · camera looking north · 10 m scale bar (left)</div></div>
<canvas id="c" width="1200" height="760"></canvas>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.180.0/build/three.module.js"}}</script>
<script type="module">
const sceneData = ${JSON.stringify(scene)};
const THREE = await import("three");
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
document.getElementById("label").textContent = sceneData.label;
renderer.setSize(1200, 760, false);
renderer.setClearColor(0xf5f3ee, 1);
const scene = new THREE.Scene();
const group = new THREE.Group();
function shapeFromRing(ring, holes) {
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
  shape.closePath();
  for (const hole of holes) {
    if (hole.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}
for (const b of sceneData.buildings) {
  const color = b.isTarget ? sceneData.civicHex : sceneData.neighbourHex;
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  for (const part of b.parts) {
    const shape = shapeFromRing(part.ring, part.holes);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, part.height, 0);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
  }
}
scene.add(group);
const box = new THREE.Box3().setFromObject(group);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
const pad = 40;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
const viewW = size.x + pad * 2;
const viewH = size.y + pad * 2 + 60;
const aspect = 1200 / 800;
let halfW = viewW / 2;
let halfH = viewH / 2;
if (halfW / halfH > aspect) halfH = halfW / aspect;
else halfW = halfH * aspect;
cam.left = -halfW;
cam.right = halfW;
cam.top = halfH;
cam.bottom = -halfH;
cam.position.set(center.x, center.y + size.y * 0.05, center.z - Math.max(size.z, 120) - 200);
cam.up.set(0, 1, 0);
cam.lookAt(center.x, center.y * 0.45, center.z);
cam.updateProjectionMatrix();
const barY = box.min.y + 2;
const barX0 = box.min.x + 12;
const barMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const capMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 1.2), barMat);
bar.position.set(barX0 + 5, barY, center.z);
scene.add(bar);
for (const dx of [0, 10]) {
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 1.2), capMat);
  cap.position.set(barX0 + dx, barY + 0.6, center.z);
  scene.add(cap);
}
renderer.render(scene, cam);
const overlay = document.createElement("div");
overlay.style.cssText =
  "position:fixed;left:0;top:0;width:1200px;height:800px;pointer-events:none;font:600 14px sans-serif;color:#111";
const capEl = document.querySelector(".cap");
const capRect = capEl.getBoundingClientRect();
const worldToPx = (wx, wy) => {
  const v = new THREE.Vector3(wx, wy, center.z).project(cam);
  return { x: (v.x * 0.5 + 0.5) * 1200, y: (-v.y * 0.5 + 0.5) * 760 + capRect.height };
};
const left = worldToPx(barX0, barY);
const label = document.createElement("div");
label.textContent = "10 m";
label.style.cssText =
  "position:absolute;left:" +
  Math.round(left.x) +
  "px;top:" +
  Math.round(left.y + 8) +
  "px;background:rgba(245,243,238,0.92);padding:2px 6px;border:1px solid #333";
overlay.appendChild(label);
document.body.appendChild(overlay);
renderer.render(scene, cam);
window.__done = true;
</script>`,
    { waitUntil: "load" },
  );
  await page.waitForFunction(() => window.__done === true);
  await page.screenshot({ path: outPath, fullPage: true });
}

await renderScene(scenes.main, "/opt/cursor/artifacts/freemasons-elev-main.png");
await renderScene(scenes.pr, "/opt/cursor/artifacts/freemasons-elev-pr.png");

for (const name of ["freemasons-elev-main.png", "freemasons-elev-pr.png"]) {
  for (const dir of ARTIFACT_DIRS) {
    if (dir !== "/opt/cursor/artifacts") copyFileSync(`/opt/cursor/artifacts/${name}`, `${dir}/${name}`);
  }
}

await browser.close();
console.log(
  JSON.stringify(
    {
      main: scenes.main.label,
      pr: scenes.pr.label,
      outputs: ["/opt/cursor/artifacts/freemasons-elev-main.png", "/opt/cursor/artifacts/freemasons-elev-pr.png"],
    },
    null,
    2,
  ),
);
