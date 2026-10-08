import { describe, expect, it } from "vitest";
import { computeCityBlocks } from "./cityBlocks";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { fetchOvertureTransportationForCut } from "./overtureTransportation";
import { fetchOvertureBaseForCut } from "./overtureBase";
import { assignExternalUses, loadUseTiers } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import { mergeBuildingEnrichment, applyLidarHeightsFromEnrichment } from "./buildingEnrichmentMerge";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import {
  areaDedupeCounts,
  blockBuildingStackingPairs,
  comOvertureOverlapCount,
  countThreeDMeshesByName,
  findDuplicateBuildingPairs,
  findDuplicateSurfaceEmits,
  footpathEmitCounts,
  planLayerEmitCounts,
  roadDedupeCounts,
} from "./layerDuplicateAudit";
import type { CityModel } from "../types";

const lat = -37.8127;
const lon = 144.98061;
const km = 1;

describe("East Melbourne duplicate audit", () => {
  it(
    "reports before/after dedupe counts and export emits without heavy IoU duplicates",
    async () => {
      const center = { lon, lat };
      const sideM = km * 1000;
      const bounds = squareBBox(center, sideM);
      const comBounds = paddedComFetchBounds(center, sideM);
      const [buildingResult, transport, base, enrichment, { zones }, dam, com] = await Promise.all([
        fetchOvertureBuildingsForCut(bounds, center, sideM),
        fetchOvertureTransportationForCut(bounds, center, sideM),
        fetchOvertureBaseForCut(bounds, center, sideM, { waterGreen: true, trees: false }),
        loadEnrichmentForCutFromDisk(bounds),
        loadUseTiers(bounds, center),
        fetchDevelopmentFloorRecords(comBounds),
        fetchComBuildingFootprintsWithStats(comBounds, center),
      ]);

      const buildingDedupe = {
        fragments: buildingResult.stats.fragmentCount,
        afterOvertureDedupe: buildingResult.stats.buildingCount,
        removedByDedupe: buildingResult.stats.fragmentCount - buildingResult.stats.buildingCount,
      };

      const roads = roadDedupeCounts(transport.roads);
      const green = areaDedupeCounts(base.areas.filter((a) => a.kind === "green"));
      const water = areaDedupeCounts(base.areas.filter((a) => a.kind === "water"));

      let buildings = mergeBuildingEnrichment(buildingResult.buildings, enrichment.byId);
      buildings = applyLidarHeightsFromEnrichment(assignExternalUses(buildings, zones));
      buildings = applyDevelopmentFloorsToBuildings(buildings, center, dam);
      buildings = applyComBuildingHeights(buildings, com.footprints).buildings;
      buildings = applyHeightSourceTruthPass(buildings, center, com.footprints, dam);

      const model: CityModel = {
        center,
        sideM,
        buildings,
        roads: transport.roads,
        areas: base.areas,
        trees: [],
        roadKm: transport.roadKm,
        buildingCapHit: buildingResult.buildingCapHit,
        sourceNote: "",
        placeLabel: "East Melbourne",
        layers: { buildings: true, roads: true, waterGreen: true, trees: false },
        blocks: computeCityBlocks({ roads: transport.roads, areas: base.areas, sideM }),
      };

      const report = {
        buildings: {
          ...buildingDedupe,
          comFootprints: com.footprints.length,
          comMatchedBuildings: comOvertureOverlapCount(buildings, com.footprints),
          osmTagged: buildings.filter((b) => (b.osmWayIds?.length ?? 0) > 0).length,
          duplicatePairsAfterDedupe: findDuplicateBuildingPairs(buildings).length,
        },
        roads,
        footpaths: footpathEmitCounts(model),
        green,
        water,
        blocks: {
          count: model.blocks?.length ?? 0,
          blockBuildingIouPairs: blockBuildingStackingPairs(model),
        },
        surfaceDuplicateIssues: findDuplicateSurfaceEmits(base.areas),
        exports: {
          threeD: countThreeDMeshesByName(model),
          plan: planLayerEmitCounts(model),
        },
      };

      console.info(JSON.stringify(report, null, 2));

      expect(buildingDedupe.afterOvertureDedupe).toBeGreaterThan(100);
      expect(report.buildings.duplicatePairsAfterDedupe).toBeLessThan(8);
      expect(report.surfaceDuplicateIssues.length).toBeLessThan(20);
      expect(report.exports.threeD.Blocks ?? 0).toBeGreaterThan(0);
      expect(report.exports.plan.blocks).toBeGreaterThan(0);
    },
    300_000,
  );
});
