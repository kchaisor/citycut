import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import { PATH_WIDTH_M } from "./lineweights";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { planPaths } from "./svgPlan";
import type { CityModel } from "../types";

const HAUSDORFF_M = 0.12;
const AREA_TOLERANCE = 0.005;

const KELVIN_CROPS: Record<string, string> = {
  "facet-spot": "125 385 70 70",
  "kerb-return": "142 442 20 20",
  "path-kink": "171 381 24 24",
  "road-gaps": "284 127 55 35",
};

function loadModel(path: string): CityModel | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CityModel;
  } catch {
    return null;
  }
}

function multiArea(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    total += Math.abs(signedArea(openRing(outer)));
    for (const hole of polygon.slice(1)) total -= Math.abs(signedArea(openRing(hole)));
  }
  return total;
}

function viewBoxBounds(vb: string): { eastMin: number; eastMax: number; northMin: number; northMax: number } {
  const [x, y, w, h] = vb.split(/\s+/).map(Number);
  return { eastMin: x, eastMax: x + w, northMin: -(y + h), northMax: -y };
}

function inCrop(east: number, north: number, vb: string): boolean {
  const b = viewBoxBounds(vb);
  return east >= b.eastMin && east <= b.eastMax && north >= b.northMin && north <= b.northMax;
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

type BoundaryPt = { east: number; north: number; edgeLen: number; turnDeg: number };

function boundaryPointsInCrop(multi: MultiPolygon, vb: string): BoundaryPt[] {
  const out: BoundaryPt[] = [];
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      const n = open.length;
      for (let i = 0; i < n; i++) {
        const curr = open[i]!;
        const prev = open[(i + n - 1) % n]!;
        const next = open[(i + 1) % n]!;
        if (!inCrop(curr[0], curr[1], vb)) continue;
        const ax = curr[0] - prev[0];
        const ay = curr[1] - prev[1];
        const bx = next[0] - curr[0];
        const by = next[1] - curr[1];
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        let turn = 0;
        if (la > 1e-9 && lb > 1e-9) {
          const cross = ax * by - ay * bx;
          const dot = ax * bx + ay * by;
          turn = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
        }
        const edgeLen = Math.max(la, lb);
        out.push({ east: curr[0], north: curr[1], edgeLen, turnDeg: turn });
      }
    }
  }
  return out;
}

function minDistToMulti(px: number, py: number, multi: MultiPolygon): number {
  let best = Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      const open = openRing(ring);
      for (let i = 0; i < open.length; i++) {
        const a = open[i]!;
        const b = open[(i + 1) % open.length]!;
        best = Math.min(best, distPointSeg(px, py, a[0], a[1], b[0], b[1]));
      }
    }
  }
  return best;
}

/** Long gentle edges are deliberately centreline-smoothed; skip them in the Hausdorff guard. */
function isDeliberatelySmoothed(pt: BoundaryPt): boolean {
  return pt.edgeLen > 2.2 && pt.turnDeg < 35;
}

function maxHausdorffOutsideSmoothed(main: MultiPolygon, pr: MultiPolygon, vb: string): number {
  let max = 0;
  for (const layer of [
    { a: main, b: pr },
    { a: pr, b: main },
  ]) {
    for (const pt of boundaryPointsInCrop(layer.a, vb)) {
      if (isDeliberatelySmoothed(pt)) continue;
      max = Math.max(max, minDistToMulti(pt.east, pt.north, layer.b));
    }
  }
  return max;
}

function maxTurnOnCurves(multi: MultiPolygon, vb: string): number {
  let max = 0;
  for (const pt of boundaryPointsInCrop(multi, vb)) {
    if (pt.turnDeg < 4) continue;
    if (pt.turnDeg > 150) continue;
    max = Math.max(max, pt.turnDeg);
  }
  return max;
}

function curveVertexCount(multi: MultiPolygon, vb: string): number {
  return boundaryPointsInCrop(multi, vb).filter((pt) => pt.turnDeg >= 4 && pt.turnDeg <= 150).length;
}

function planMain(model: CityModel) {
  clearFootpathUnionCacheForTests();
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    smoothOutput: false,
    centrelineSmooth: false,
  });
}

function planPr(model: CityModel) {
  clearFootpathUnionCacheForTests();
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    smoothOutput: true,
    centrelineSmooth: true,
  });
}

function layerCounts(multi: MultiPolygon): number {
  return multi.length;
}

describe("plan smooth real-data guards", () => {
  const east = loadModel("/opt/cursor/artifacts/east-model.json");
  const jolimont = loadModel("/opt/cursor/artifacts/jolimont-model.json");
  const models: Array<{ name: string; model: CityModel }> = [];
  if (east) models.push({ name: "east", model: east });
  if (jolimont) models.push({ name: "jolimont", model: jolimont });
  const fixture = loadModel(fileURLToPath(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url)));
  if (fixture) models.push({ name: "east-fixture", model: fixture });

  if (models.length === 0) {
    it("skipped — no real models in /opt/cursor/artifacts", () => {});
    return;
  }

  for (const { name, model } of models) {
    describe(name, () => {
      it("keeps layers present and area within tolerance vs main", () => {
        const main = planMain(model);
        const pr = planPr(model);
        const areaTol = name === "east-fixture" ? 0.02 : AREA_TOLERANCE;
        for (const layer of ["pathFill", "roadFill"] as const) {
          const baseA = multiArea(main[layer]);
          const prA = multiArea(pr[layer]);
          expect(prA).toBeGreaterThan(0);
          expect(Math.abs(prA - baseA) / Math.max(baseA, 1)).toBeLessThanOrEqual(areaTol);
          expect(layerCounts(pr[layer])).toBeGreaterThan(0);
        }
        expect(pr.green.length).toBeGreaterThan(0);
      });
    });
  }

  if (jolimont) {
    describe("jolimont crops", () => {
      const main = planMain(jolimont);
      const pr = planPr(jolimont);
      const metrics: Record<
        string,
        { hausdorffM: number; maxTurnMain: number; maxTurnPr: number; curveVertsMain: number; curveVertsPr: number }
      > = {};

      for (const [cropName, vb] of Object.entries(KELVIN_CROPS)) {
        const hPath = maxHausdorffOutsideSmoothed(main.pathFill, pr.pathFill, vb);
        const hRoad = maxHausdorffOutsideSmoothed(main.roadFill, pr.roadFill, vb);
        metrics[cropName] = {
          hausdorffM: Math.max(hPath, hRoad),
          maxTurnMain: Math.max(maxTurnOnCurves(main.pathFill, vb), maxTurnOnCurves(main.roadFill, vb)),
          maxTurnPr: Math.max(maxTurnOnCurves(pr.pathFill, vb), maxTurnOnCurves(pr.roadFill, vb)),
          curveVertsMain: curveVertexCount(main.pathFill, vb) + curveVertexCount(main.roadFill, vb),
          curveVertsPr: curveVertexCount(pr.pathFill, vb) + curveVertexCount(pr.roadFill, vb),
        };
      }

      for (const [cropName, m] of Object.entries(metrics)) {
        it(`${cropName} hausdorff ≤ ${HAUSDORFF_M} m outside smoothed curves`, () => {
          expect(m.hausdorffM).toBeLessThanOrEqual(HAUSDORFF_M + 0.001);
        });
      }

      it("curve turns shrink and vertex count grows in each crop", () => {
        for (const m of Object.values(metrics)) {
          expect(m.maxTurnPr).toBeLessThanOrEqual(m.maxTurnMain + 0.001);
          expect(m.curveVertsPr).toBeGreaterThanOrEqual(m.curveVertsMain);
        }
      });
    });
  }
});

export { KELVIN_CROPS, maxHausdorffOutsideSmoothed, maxTurnOnCurves, curveVertexCount };
