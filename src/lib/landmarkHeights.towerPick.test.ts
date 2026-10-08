import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { fromLocal, toLocal } from "./geo";
import { pickBuildingAtPoint, landmarkHeightAtPoint } from "./landmarkBuildingPick";
import { resolveLandmarkCut, type LandmarkCutSnapshot } from "./landmarkHeightPipeline";
import { inferHeightTier } from "./buildingHeightResolve";
import { interiorPoint } from "./useCascade";

function loadSnapshot() {
  const path = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as { cuts: LandmarkCutSnapshot[] };
}

describe.skip("tower landmark picks (dev-only)", () => {
  it("logs best com tower near seed", () => {
    const seeds: { name: string; lat: number; lon: number; minH: number }[] = [
      { name: "120 Collins Street", lat: -37.8136, lon: 144.9717, minH: 200 },
      { name: "Melbourne Central (office tower)", lat: -37.8106, lon: 144.9631, minH: 200 },
      { name: "Crown Towers", lat: -37.8228, lon: 144.9579, minH: 70 },
      { name: "General Post Office Melbourne", lat: -37.8147, lon: 144.9627, minH: 25 },
    ];
    const byName = new Map(loadSnapshot().cuts.map((c) => [c.name, c]));
    for (const seed of seeds) {
      const cut = byName.get(seed.name)!;
      const final = resolveLandmarkCut(cut);
      const at = toLocal(seed.lat, seed.lon, cut.center);
      const candidates = final
        .filter((b) => b.height >= seed.minH && inferHeightTier(b) !== "zone_default")
        .map((b) => {
          const c = interiorPoint(b.ring, b.holes);
          return { b, dist: Math.hypot(c[0] - at[0], c[1] - at[1]) };
        })
        .sort((a, b) => a.dist - b.dist || b.b.height - a.b.height);
      const best = candidates[0]?.b;
      if (!best) {
        console.info(`${seed.name}: no tower candidate`);
        continue;
      }
      if (seed.name === "Melbourne Central (office tower)") {
        const tallest = final.sort((a, b) => b.height - a.height)[0];
        console.info(`  tallest id=${tallest?.id} h=${tallest?.height.toFixed(1)} tier=${tallest ? inferHeightTier(tallest) : "—"}`);
      }
      const inner = interiorPoint(best.ring, best.holes);
      const geo = fromLocal(inner, cut.center);
      const h = landmarkHeightAtPoint(best, inner);
      console.info(
        `${seed.name}: lat=${geo.lat.toFixed(6)} lon=${geo.lon.toFixed(6)} id=${best.id} h=${h.toFixed(1)}`,
      );
      const pick = pickBuildingAtPoint(final, geo.lat, geo.lon, cut.center);
      console.info(`  verify pick h=${pick?.heightM.toFixed(1)} tier=${pick ? inferHeightTier(pick.building) : "—"}`);
    }
    for (const name of ["Melbourne Central (office tower)", "Crown Towers"]) {
      const cut = byName.get(name)!;
      const final = resolveLandmarkCut(cut);
      const top = final.sort((a, b) => b.height - a.height).slice(0, 6);
      console.info(`${name} top heights: ${top.map((b) => b.height.toFixed(1)).join(", ")}`);
    }
  });
});
