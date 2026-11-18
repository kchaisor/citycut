import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { sitePlanSvg } from "./aiPlan";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import { clearPlanShadowCache, planShadowSplitRings } from "./buildingShadows";
import { createMassingBlock } from "./massingBlock";
import { massingBlocksToBuildingFeats } from "./massingBlockPlan";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import { existingShadowLayerName, addedShadowLayerName, receptorLayerName } from "./solarStudyLayers";
import { assessSolarReceptors, type SolarReceptorArea } from "./solarReceptorAssess";
import { solarReceptorsForExport } from "./solarReceptorExport";
import type { BuildingFeat, CityModel } from "../types";

const BOX_HILL = { lat: -37.8185, lon: 145.123 };

function box(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
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

function boxHillModel(): CityModel {
  const drawn = createMassingBlock("export-test", [
    [8, -8],
    [38, -8],
    [38, 10],
    [24, 10],
    [24, 34],
  ], { floors: 6, width_m: 14 });
  const proposed = massingBlocksToBuildingFeats([drawn])[0]!;
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
    sourceNote: "test",
    siteBoundaryLines: [
      [
        [-95, -95],
        [95, -95],
        [95, 95],
        [-95, 95],
        [-95, -95],
      ],
    ],
  } as CityModel;
}

const date = { lat: BOX_HILL.lat, lon: BOX_HILL.lon, year: 2026, month: 9, day: 22 };

function sunStudyLayers(model: CityModel) {
  return SUN_STUDY_HOURS.map((hour) => {
    const split = planShadowSplitRings(model, { ...date, hour, minute: 0 }, true);
    return {
      hour,
      minute: 0,
      existingRings: split.existing,
      addedRings: split.added,
    };
  });
}

function svgLayerLabels(svg: string): string[] {
  return [...svg.matchAll(/inkscape:label="([^"]+)"/g)].map((match) => match[1]!);
}

function countPathsInLayer(svg: string, layer: string): number {
  const pattern = new RegExp(`inkscape:label="${layer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?</g>`, "g");
  const groups = svg.match(pattern) ?? [];
  return groups.reduce((sum, group) => sum + (group.match(/<path /g)?.length ?? 0), 0);
}

describe("solar layered export", () => {
  beforeEach(() => clearPlanShadowCache());

  it("writes existing and added shadow layers, massing, receptors, and site boundary to SVG and Rhino", async () => {
    const model = boxHillModel();
    const receptors: SolarReceptorArea[] = [
      { id: "R1", ring: [[-45, -20], [45, -20], [45, -5], [-45, -5], [-45, -20]] },
    ];
    const results = assessSolarReceptors(model, receptors, 2026);
    const solarReceptors = solarReceptorsForExport(receptors, results);
    const studyLayers = sunStudyLayers(model);
    const study = { layers: studyLayers };
    const svg = await sitePlanSvg(model, 1000, undefined, { sunStudy: study, solarReceptors, castShadows: true });
    const labels = svgLayerLabels(svg);
    expect(labels).toContain("Buildings");
    expect(labels).toContain("Proposed massing");
    expect(labels).toContain("Site boundary");
    expect(labels).toContain(existingShadowLayerName(12, 0));
    expect(labels).toContain(addedShadowLayerName(12, 0));
    expect(labels).toContain(receptorLayerName("R1", solarReceptors[0]!.statusTone));
    expect(countPathsInLayer(svg, existingShadowLayerName(12, 0))).toBeGreaterThan(0);
    expect(countPathsInLayer(svg, addedShadowLayerName(12, 0))).toBeGreaterThan(0);
    expect(countPathsInLayer(svg, "Proposed massing")).toBeGreaterThan(0);

    const bytes = await cityModelTo3dm(model, { sunStudy: study, solarReceptors, castShadows: true });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    const layers: string[] = [];
    const objectCount = new Map<string, number>();
    for (let i = 0; i < doc.layers().count; i++) layers.push(doc.layers().get(i).fullPath);
    for (let i = 0; i < doc.objects().count; i++) {
      const layer = doc.layers().get(doc.objects().get(i).attributes().layerIndex).fullPath;
      objectCount.set(layer, (objectCount.get(layer) ?? 0) + 1);
    }
    doc.destroy();
    expect(layers).toContain(existingShadowLayerName(12, 0));
    expect(layers).toContain(addedShadowLayerName(12, 0));
    expect(layers).toContain(receptorLayerName("R1", solarReceptors[0]!.statusTone));
    expect(layers).toContain("Proposed massing");
    expect(layers).toContain("Site::Boundary");
    expect((objectCount.get(existingShadowLayerName(12, 0)) ?? 0)).toBeGreaterThan(0);
    expect((objectCount.get(addedShadowLayerName(12, 0)) ?? 0)).toBeGreaterThan(0);
    expect((objectCount.get("Proposed massing") ?? 0)).toBeGreaterThan(0);

    if (process.env.SOLAR_EXPORT_ARTIFACTS) {
      const art = process.env.CURSOR_ARTIFACTS_DIR || "/opt/cursor/artifacts";
      mkdirSync(art, { recursive: true });
      writeFileSync(path.join(art, "solar-layered-export-box-hill.svg"), svg);
      writeFileSync(path.join(art, "solar-layered-export-box-hill.3dm"), Buffer.from(bytes));
      writeFileSync(
        path.join(art, "solar-layered-export-layer-names.json"),
        `${JSON.stringify({ svgLayers: [...new Set(labels)].sort(), rhinoLayers: layers.sort() }, null, 2)}\n`,
      );
    }
  });
});
