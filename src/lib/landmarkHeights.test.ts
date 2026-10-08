import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { squareBBox, toLocal } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { mergeBuildingEnrichment, applyLidarHeightsFromEnrichment } from "./buildingEnrichmentMerge";
import { fetchBuildingEnrichmentForCut } from "./buildingEnrichmentTiles";
import { assignExternalUses, loadUseTiers, pointInPolygon } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import { inferHeightTier } from "./buildingHeightResolve";
import { heightTierLabel } from "./buildingHeightResolve";
import type { BuildingFeat } from "../types";

type Landmark = {
  name: string;
  lat: number;
  lon: number;
  heightM: number;
  toleranceM: number;
  sourceUrl: string;
};

async function resolveBuildingAt(lat: number, lon: number): Promise<BuildingFeat | null> {
  const center = { lon, lat };
  const sideM = 400;
  const bounds = squareBBox(center, sideM);
  const comBounds = paddedComFetchBounds(center, sideM);
  const [{ buildings: raw }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
    fetchOvertureBuildingsForCut(bounds, center, sideM),
    fetchBuildingEnrichmentForCut(bounds),
    loadUseTiers(bounds, center),
    fetchDevelopmentFloorRecords(comBounds),
    fetchComBuildingFootprintsWithStats(comBounds, center),
  ]);
  const enriched = mergeBuildingEnrichment(raw, enrichment.byId);
  const zoned = assignExternalUses(enriched, zones);
  const withLidar = applyLidarHeightsFromEnrichment(zoned);
  const withDam = applyDevelopmentFloorsToBuildings(withLidar, center, dam);
  const { buildings: withCom } = applyComBuildingHeights(withDam, footprints);
  const final = applyHeightSourceTruthPass(withCom, center, footprints, dam);
  const at = toLocal(lat, lon, center);
  for (const building of final) {
    if (pointInPolygon(at, building.ring, building.holes)) return building;
  }
  let best: BuildingFeat | null = null;
  let bestDist = Infinity;
  for (const building of final) {
    const c = building.ring[0];
    if (!c) continue;
    const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
    if (d < bestDist) {
      bestDist = d;
      best = building;
    }
  }
  return bestDist < 80 ? best : null;
}

describe("Melbourne landmark height reference (CI)", () => {
  it(
    "reports a pass/fail table and rejects zone defaults",
    async () => {
      const rows: string[] = [];
      rows.push("building | cited_m | computed_m | tier | delta | pass");
      const zoneDefaultFailures: string[] = [];
      for (const lm of landmarks as Landmark[]) {
        const building = await resolveBuildingAt(lm.lat, lm.lon);
        if (!building) {
          console.warn(`${lm.name}: no Overture footprint within 400 m search`);
          rows.push(`${lm.name} | ${lm.heightM} | — | — | — | FAIL`);
          continue;
        }
        const tier = inferHeightTier(building);
        const computed = building.height;
        const delta = Math.abs(computed - lm.heightM);
        const passDelta = delta <= lm.toleranceM;
        const pass = tier !== "zone_default" && passDelta;
        if (tier === "zone_default") {
          zoneDefaultFailures.push(`${lm.name}: tier=${tier} (${lm.sourceUrl})`);
        }
        if (!passDelta) {
          console.warn(`${lm.name}: height Δ=${delta.toFixed(1)}m exceeds tolerance (cited ${lm.heightM}m)`);
        }
        rows.push(
          `${lm.name} | ${lm.heightM} | ${computed.toFixed(1)} | ${heightTierLabel(tier)} | ${delta.toFixed(1)} | ${pass ? "PASS" : "FAIL"}`,
        );
      }
      console.info(rows.join("\n"));
      expect(zoneDefaultFailures, zoneDefaultFailures.join("\n")).toEqual([]);
    },
    600_000,
  );
});
