import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { applyOverrideToBuilding } from "../src/lib/heightOverrides";
import { openRing } from "../src/lib/geo";
import { cityModelTo3dm } from "../src/lib/rhinoExport";
import { loadRhino } from "../src/lib/rhinoExport";
import { projectLocal } from "../src/lib/crs";
import type { BuildingFeat } from "../types";

/** Run with QA report JSON: QA_BUILDING_JSON=/path/to/report.json npm test -- scripts/qa-rhino-building-height.test.ts */
describe("QA rhino height for picked CBD building", () => {
  it("max mesh Z matches override height", async () => {
    const path = process.env.QA_BUILDING_JSON;
    if (!path) return;
    const report = JSON.parse(await readFile(path, "utf8")) as {
      buildingId: number;
      heightAfterM: number;
      frameBuilding: BuildingFeat;
    };
    const origin = { lon: 144.9631, lat: -37.8136 };
    const building = applyOverrideToBuilding(report.frameBuilding, report.heightAfterM);
    const bytes = await cityModelTo3dm({
      placeLabel: "QA",
      center: origin,
      sideM: 600,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings: [building],
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "qa",
    });
    const rhino = await loadRhino();
    const doc = rhino.File3dm.fromByteArray(bytes);
    try {
      const ring = openRing(building.ring);
      let east = 0;
      let north = 0;
      for (const [x, y] of ring) {
        east += x;
        north += y;
      }
      east /= ring.length;
      north /= ring.length;
      const anchor = projectLocal([east, north], origin, 55);
      let maxZ = -Infinity;
      for (let i = 0; i < doc.objects().count; i++) {
        const geometry = doc.objects().get(i).geometry() as {
          objectType: number;
          vertices: () => { count: number; point3dAt: (index: number) => number[] };
        };
        if (geometry.objectType !== rhino.ObjectType.Mesh) continue;
        for (let v = 0; v < geometry.vertices().count; v++) {
          const pt = geometry.vertices().point3dAt(v);
          if (Math.hypot(pt[0] - anchor[0], pt[1] - anchor[1]) < 30) maxZ = Math.max(maxZ, pt[2]);
        }
      }
      expect(maxZ).toBeGreaterThan(report.heightAfterM - 1);
      expect(maxZ).toBeLessThan(report.heightAfterM + 1);
      await writeFile(
        "/opt/cursor/artifacts/cbd-height-rhino.json",
        JSON.stringify({ rhinoExportMaxZM: maxZ, buildingId: report.buildingId }, null, 2),
      );
    } finally {
      doc.destroy();
    }
  });
});
