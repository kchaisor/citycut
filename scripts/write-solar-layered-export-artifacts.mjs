import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMassingBlock } from "../src/lib/massingBlock.ts";
import { massingBlocksToBuildingFeats } from "../src/lib/massingBlockPlan.ts";
import { clearPlanShadowCache, planShadowSplitRings } from "../src/lib/buildingShadows.ts";
import { SUN_STUDY_HOURS } from "../src/lib/sunStudyPlan.ts";
import { assessSolarReceptors } from "../src/lib/solarReceptorAssess.ts";
import { sitePlanSvg } from "../src/lib/aiPlan.ts";
import { cityModelTo3dm } from "../src/lib/rhinoExport.ts";

const ART = process.env.CURSOR_ARTIFACTS_DIR || "/opt/cursor/artifacts";
const BOX_HILL = { lat: -37.8185, lon: 145.123 };
const date = { lat: BOX_HILL.lat, lon: BOX_HILL.lon, year: 2026, month: 9, day: 22 };

function box(id, east, north, size, height) {
  const half = size / 2;
  return {
    id,
    ring: [
      [east - half, north - half],
      [east + half, north - half],
      [east + half, north + half],
      [east - half, north + half],
      [east - half, north - half],
    ],
    holes: [],
    height,
    use: "unclassified",
    source: "none",
  };
}

function boxHillModel() {
  const drawn = createMassingBlock(
    "artifact-export",
    [
      [8, -8],
      [38, -8],
      [38, 10],
      [24, 10],
      [24, 34],
    ],
    { floors: 6, width_m: 14 },
  );
  const proposed = massingBlocksToBuildingFeats([drawn])[0];
  return {
    placeLabel: "Box Hill VIC",
    center: BOX_HILL,
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings: [box(1, -28, 4, 22, 16), proposed],
    roads: [],
    areas: [],
    trees: [],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "artifact",
    siteBoundaryLines: [
      [
        [-95, -95],
        [95, -95],
        [95, 95],
        [-95, 95],
        [-95, -95],
      ],
    ],
  };
}

clearPlanShadowCache();
const model = boxHillModel();
const studyLayers = SUN_STUDY_HOURS.map((hour) => {
  const split = planShadowSplitRings(model, { ...date, hour, minute: 0 }, true);
  return { hour, minute: 0, existingRings: split.existing, addedRings: split.added };
});
const receptors = [{ id: "south-yard", ring: [[-45, -20], [45, -20], [45, -5], [-45, -5], [-45, -20]] }];
const results = assessSolarReceptors(model, receptors, 2026);
const solarReceptors = receptors.map((receptor, index) => ({
  id: receptor.id,
  ring: receptor.ring,
  statusTone: results[index].statusTone,
}));
const exportOptions = { sunStudy: { layers: studyLayers }, solarReceptors, castShadows: true };

mkdirSync(ART, { recursive: true });
const svg = await sitePlanSvg(model, 1000, undefined, exportOptions);
const svgPath = path.join(ART, "solar-layered-export-box-hill.svg");
writeFileSync(svgPath, svg);
const svgLayers = [...new Set([...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((match) => match[1]))].sort();

const bytes = await cityModelTo3dm(model, exportOptions);
const dmPath = path.join(ART, "solar-layered-export-box-hill.3dm");
writeFileSync(dmPath, Buffer.from(bytes));

const rhinoModule = await import("rhino3dm/rhino3dm.module.js");
const rhino = await rhinoModule.default();
const doc = rhino.File3dm.fromByteArray(bytes);
const rhinoLayers = [];
for (let i = 0; i < doc.layers().count; i++) rhinoLayers.push(doc.layers().get(i).fullPath);
doc.destroy();
rhinoLayers.sort();

const manifest = { svgLayers, rhinoLayers };
writeFileSync(path.join(ART, "solar-layered-export-layer-names.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ svgPath, dmPath, ...manifest }, null, 2));
