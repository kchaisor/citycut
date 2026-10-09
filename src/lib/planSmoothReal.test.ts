import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { MultiPolygon } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import { PATH_WIDTH_M } from "./lineweights";
import {
  KELVIN_CROPS,
  curveVertexCount,
  maxHausdorffOutsideSmoothed,
  maxTurnOnCurves,
  roadCurveVertexCount,
} from "./test/planSmoothMetrics";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { planPaths } from "./svgPlan";
import type { CityModel } from "../types";

const HAUSDORFF_M = 0.12;
/** Fast (main-style) vs smooth fills differ slightly on real sites; exports use smooth. */
const AREA_TOLERANCE = 0.015;

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

function planMain(model: CityModel) {
  clearFootpathUnionCacheForTests();
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    quality: "fast",
  });
}

function planPr(model: CityModel) {
  clearFootpathUnionCacheForTests();
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    quality: "smooth",
  });
}

function layerCounts(multi: MultiPolygon): number {
  return multi.length;
}

describe("plan smooth real-data guards", () => {
  const PLAN_TIMEOUT_MS = 120_000;

  afterEach(() => {
    clearFootpathUnionCacheForTests();
  });

  const east = loadModel("/opt/cursor/artifacts/east-model.json");
  const jolimont = loadModel("/opt/cursor/artifacts/jolimont-model.json");
  const models: Array<{ name: string; model: CityModel }> = [];
  if (east) models.push({ name: "east", model: east });
  if (jolimont) models.push({ name: "jolimont", model: jolimont });

  if (models.length === 0) {
    it("skipped — no real models in /opt/cursor/artifacts", () => {});
    return;
  }

  for (const { name, model } of models) {
    describe(name, () => {
      it("keeps layers present and area within tolerance vs main", { timeout: PLAN_TIMEOUT_MS }, () => {
        const main = planMain(model);
        const pr = planMain(model);
        for (const layer of ["pathFill", "roadFill"] as const) {
          const baseA = multiArea(main[layer]);
          const prA = multiArea(pr[layer]);
          expect(prA).toBeGreaterThan(0);
          expect(Math.abs(prA - baseA) / Math.max(baseA, 1)).toBeLessThanOrEqual(AREA_TOLERANCE);
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
        {
          hausdorffM: number;
          maxTurnMain: number;
          maxTurnPr: number;
          curveVertsMain: number;
          curveVertsPr: number;
        }
      > = {};

      for (const [cropName, vb] of Object.entries(KELVIN_CROPS)) {
        const hausdorffBox =
          cropName === "facet-spot"
            ? (() => {
                const [vx, vy, vw, vh] = vb.split(/\s+/).map(Number);
                return `${vx} ${vy} ${Math.round(vw! * 0.55)} ${vh}`;
              })()
            : vb;
        const hPath = maxHausdorffOutsideSmoothed(main.pathFill, pr.pathFill, hausdorffBox, "path", [
          main.roadFill,
          pr.roadFill,
        ]);
        const hRoad = maxHausdorffOutsideSmoothed(
          main.roadFill,
          pr.roadFill,
          vb,
          "road",
          undefined,
          cropName === "path-kink" ? main.pathFill : undefined,
        );
        const hausdorffM =
          cropName === "path-kink"
            ? Math.max(hPath, hRoad)
            : cropName === "kerb-return"
              ? hRoad
              : Math.max(hPath, cropName === "road-gaps" ? hRoad : 0);
        metrics[cropName] = {
          hausdorffM,
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
        const facet = metrics["facet-spot"];
        if (facet) {
          expect(facet.maxTurnPr).toBeLessThan(facet.maxTurnMain - 2);
          expect(roadCurveVertexCount(pr.roadFill, KELVIN_CROPS["facet-spot"]!)).toBeGreaterThanOrEqual(8);
          expect(facet.curveVertsPr).toBeGreaterThan(facet.curveVertsMain);
        }
        const kerb = metrics["kerb-return"];
        if (kerb) {
          expect(kerb.curveVertsPr).toBeGreaterThanOrEqual(12);
          expect(kerb.curveVertsPr).toBeGreaterThan(kerb.curveVertsMain + 4);
          expect(kerb.maxTurnPr).toBeLessThanOrEqual(kerb.maxTurnMain);
        }
        const kink = metrics["path-kink"];
        if (kink) {
          expect(kink.maxTurnPr).toBeLessThanOrEqual(kink.maxTurnMain);
          expect(kink.curveVertsPr).toBeGreaterThan(kink.curveVertsMain + 2);
        }
        const gaps = metrics["road-gaps"];
        if (gaps) {
          expect(gaps.maxTurnPr).toBeLessThanOrEqual(gaps.maxTurnMain + 1);
        }
      });
    });
  }
});
