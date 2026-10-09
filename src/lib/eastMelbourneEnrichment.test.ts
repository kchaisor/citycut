import { describe, expect, it } from "vitest";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { assignExternalUses, loadUseTiers } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import {
  applyLidarHeightsFromEnrichment,
  countUseSourceTiers,
  mergeBuildingEnrichment,
} from "./buildingEnrichmentMerge";
import { inferHeightTier } from "./buildingHeightResolve";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import { networkTestsEnabled } from "./test/networkTests";

const lat = -37.8127;
const lon = 144.98061;
const km = 1;

function heightSourceCensus(buildings: Awaited<ReturnType<typeof fetchOvertureBuildingsForCut>>["buildings"]) {
  const counts: Record<string, number> = {};
  for (const building of buildings) {
    const tier = inferHeightTier(building);
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

describe.skipIf(!networkTestsEnabled())("East Melbourne building use census (CLUE enrichment)", () => {
  it(
    "assigns most zone-tier buildings to CLUE after enrichment tiles merge",
    async () => {
      const center = { lon, lat };
      const sideM = km * 1000;
      const bounds = squareBBox(center, sideM);
      const comBounds = paddedComFetchBounds(center, sideM);
      const [{ buildings: raw, stats }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
        fetchOvertureBuildingsForCut(bounds, center, sideM),
        loadEnrichmentForCutFromDisk(bounds),
        loadUseTiers(bounds, center),
        fetchDevelopmentFloorRecords(comBounds),
        fetchComBuildingFootprintsWithStats(comBounds, center),
      ]);
      const legacyBuildings = assignExternalUses(raw, zones);
      const legacy = countUseSourceTiers(legacyBuildings);
      const enriched = mergeBuildingEnrichment(raw, enrichment.byId);
      const zoned = assignExternalUses(enriched, zones);
      const withLidar = applyLidarHeightsFromEnrichment(zoned);
      const withDam = applyDevelopmentFloorsToBuildings(withLidar, center, dam);
      const { buildings: withCom } = applyComBuildingHeights(withDam, footprints);
      const final = applyHeightSourceTruthPass(withCom, center, footprints, dam);
      const after = countUseSourceTiers(final);

      console.info(
        JSON.stringify(
          {
            eastMelbourne: { lat, lon, km },
            overtureBuildingCount: stats.buildingCount,
            useSourceBeforeEnrichment: legacy,
            useSourceAfterEnrichment: after,
            heightSourceBeforeEnrichment: heightSourceCensus(legacyBuildings),
            heightSourceAfterEnrichment: heightSourceCensus(final),
            lidarTierNote: "LiDAR: licensed Vicmap data, not available",
            zoneDelta: legacy.zone - after.zone,
            clueAssigned: after.clue,
          },
          null,
          2,
        ),
      );

      expect(after.clue).toBeGreaterThan(40);
      expect(after.zone).toBeLessThan(legacy.zone);
      expect(after.clue).toBeGreaterThan(after.zone);
    },
    240_000,
  );
});
