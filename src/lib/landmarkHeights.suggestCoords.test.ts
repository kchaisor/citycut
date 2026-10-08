/**
 * Suggest lat/lon interior points for landmarks (network-free, uses snapshot).
 * npx vitest run src/lib/landmarkHeights.suggestCoords.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { fromLocal, toLocal } from "./geo";
import { pickBuildingAtPoint } from "./landmarkBuildingPick";
import { resolveLandmarkCut, type LandmarkCutSnapshot } from "./landmarkHeightPipeline";
import { inferHeightTier } from "./buildingHeightResolve";
import { interiorPoint } from "./useCascade";

function loadSnapshot() {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as { cuts: LandmarkCutSnapshot[] };
}

describe.skip("landmark coordinate suggestions (dev-only)", () => {
  it("prints interior points for tallest neighbour when fix needed", () => {
    const byName = new Map(loadSnapshot().cuts.map((c) => [c.name, c]));
    for (const lm of landmarks as { name: string; lat: number; lon: number; heightM: number }[]) {
      const cut = byName.get(lm.name)!;
      const final = resolveLandmarkCut(cut);
      let pick = pickBuildingAtPoint(final, lm.lat, lm.lon, cut.center);
      if (!pick) {
        const at = toLocal(lm.lat, lm.lon, cut.center);
        const candidates = final
          .map((building) => {
            const c = interiorPoint(building.ring, building.holes);
            return {
              building,
              dist: Math.hypot(c[0] - at[0], c[1] - at[1]),
            };
          })
          .filter((row) => row.dist < 220)
          .sort((a, b) => b.building.height - a.building.height || a.dist - b.dist);
        const target = candidates[0]?.building;
        if (target) {
          const inner = interiorPoint(target.ring, target.holes);
          const geo = fromLocal(inner, cut.center);
          pick = pickBuildingAtPoint(final, geo.lat, geo.lon, cut.center) ?? {
            building: target,
            heightM: target.height,
            at: inner,
          };
          console.info(
            `${lm.name}: SUGGEST lat=${geo.lat.toFixed(6)} lon=${geo.lon.toFixed(6)} id=${target.id} h=${pick.heightM.toFixed(1)} tier=${inferHeightTier(target)}`,
          );
          continue;
        }
      }
      if (pick) {
        const geo = fromLocal(pick.at, cut.center);
        console.info(
          `${lm.name}: OK lat=${geo.lat.toFixed(6)} lon=${geo.lon.toFixed(6)} id=${pick.building.id} h=${pick.heightM.toFixed(1)} tier=${inferHeightTier(pick.building)} cited=${lm.heightM}`,
        );
      } else {
        console.info(`${lm.name}: NO CANDIDATE`);
      }
    }
  });
});
