import { describe, expect, it } from "vitest";
import { computeCityBlocks } from "./cityBlocks";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { fetchOvertureTransportationForCut } from "./overtureTransportation";
import { fetchOvertureBaseForCut } from "./overtureBase";
import { assignExternalUses, loadUseTiers } from "./useCascade";
import { fetchComBuildingFootprintsWithStats, paddedComFetchBounds } from "./comBuildingHeights";
import { fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { resolveBuildingHeights } from "./buildingHeightPipeline";
import {
  applyEastMelbourneDisplayHeights,
  loadEastMelbourneHeightInputsFromFixture,
} from "./eastMelbourneHeightsPipeline";
import { mergeBuildingEnrichment, applyLidarHeightsFromEnrichment } from "./buildingEnrichmentMerge";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import {
  areaDedupeCounts,
  blockBuildingStackingPairs,
  buildingMeshOverlaps,
  comOvertureOverlapCount,
  countBuildingMeshesById,
  countThreeDMeshesByName,
  findDuplicateBuildingPairs,
  findDuplicateSurfaceEmits,
  footpathEmitCounts,
  planLayerEmitCounts,
  roadDedupeCounts,
} from "./layerDuplicateAudit";
import type { CityModel } from "../types";
import { networkTestsEnabled } from "./test/networkTests";

const lat = -37.8127;
const lon = 144.98061;
const km = 1;

/**
 * CoM is always on, so this is the only render path. Offline: the committed East Melbourne
 * inputs (496 Overture footprints, 1,240 CoM 2023 footprint components) through the same
 * pipeline as ModelPage, then the same three.js group the viewport and .3dm export build.
 */
describe("East Melbourne duplicate audit, CoM on (committed fixture)", () => {
  it(
    "draws every building once: no overlapping CoM parts, no IoU > 0.5 pairs, one mesh set per building",
    () => {
      const input = loadEastMelbourneHeightInputsFromFixture();
      const buildings = applyEastMelbourneDisplayHeights(input);
      const comBuildings = buildings.filter((b) => b.heightTier === "com");
      expect(buildings.length).toBe(496);
      expect(comBuildings.length).toBeGreaterThan(300);

      // Two Overture/CoM footprints for the same building.
      expect(findDuplicateBuildingPairs(buildings)).toEqual([]);
      // Stacked CoM components drawn as nested prisms (main had 1,127 pairs in 183 buildings).
      const overlaps = buildingMeshOverlaps(buildings);
      expect(overlaps.withinBuildingPairs, JSON.stringify(overlaps.examples)).toBe(0);
      expect(overlaps.acrossBuildingPairs, JSON.stringify(overlaps.examples)).toBe(0);

      // No separate CoM layer: the 3D group holds exactly the parts of the matched buildings.
      const model: CityModel = {
        center: input.center,
        sideM: input.sideM,
        buildings,
        roads: [],
        areas: [],
        trees: [],
        roadKm: 0,
        buildingCapHit: false,
        sourceNote: "",
        placeLabel: "East Melbourne",
        layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      };
      const meshesById = countBuildingMeshesById(model);
      expect(buildings.filter((b) => b.meshDrawnBy != null)).toEqual([]);
      expect(meshesById.size).toBe(buildings.length);
      for (const building of buildings) {
        expect(meshesById.get(building.id)).toBe(building.extrusionParts?.length || 1);
      }
    },
    120_000,
  );
});

describe.skipIf(!networkTestsEnabled())("East Melbourne duplicate audit", () => {
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
      // Same order as ModelPage: CoM always, then DAM, then the truth pass.
      buildings = resolveBuildingHeights(buildings, center, com.footprints, dam);

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
          meshOverlaps: buildingMeshOverlaps(buildings),
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
      expect(report.buildings.duplicatePairsAfterDedupe).toBe(0);
      expect(report.buildings.meshOverlaps.withinBuildingPairs).toBe(0);
      expect(report.buildings.meshOverlaps.acrossBuildingPairs).toBe(0);
      expect(report.surfaceDuplicateIssues.length).toBeLessThan(20);
      expect(report.exports.threeD.Blocks ?? 0).toBeGreaterThan(0);
      expect(report.exports.plan.blocks).toBeGreaterThan(0);
    },
    300_000,
  );
});
