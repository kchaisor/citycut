import { describe, expect, it } from "vitest";
import { comRecordsToTrees, fetchComTrees } from "./comTrees";
import { fetchOvertureBaseForCut } from "./overtureBase";
import { fetchVicmapTrees, vicmapPointsToTrees } from "./vicmapTrees";
import { assembleTreeTiers } from "./treeTiers";

const ORIGIN = { lat: -37.81313, lon: 144.98122 };
const SIDE_M = 1000;
const PARK = { south: -37.8165, north: -37.8105, west: 144.9775, east: 144.983 };

describe("Fitzroy Gardens tree merge", () => {
  it(
    "returns about 1,800–2,000 trees in the park box after tier merge",
    async () => {
      const bounds = {
        south: ORIGIN.lat - (SIDE_M / 2) / 111_000,
        north: ORIGIN.lat + (SIDE_M / 2) / 111_000,
        west: ORIGIN.lon - (SIDE_M / 2) / 85_000,
        east: ORIGIN.lon + (SIDE_M / 2) / 85_000,
      };
      const [comResult, vicmapResult, base] = await Promise.all([
        fetchComTrees(bounds),
        fetchVicmapTrees(bounds),
        fetchOvertureBaseForCut(bounds, ORIGIN, SIDE_M, { waterGreen: true, trees: true, frameShape: "square" }),
      ]);
      const assembled = assembleTreeTiers({
        com: comRecordsToTrees(comResult, ORIGIN, SIDE_M, "square"),
        osm: base.overtureTrees,
        vicmap: vicmapPointsToTrees(vicmapResult, ORIGIN, SIDE_M, "square"),
        canopy: base.treeContext.canopy,
        buildings: base.treeContext.buildings,
        water: base.treeContext.water,
        roads: base.treeContext.roads,
      });
      const { fromLocal } = await import("./geo");
      const inBox = assembled.trees.filter((tree) => {
        const { lat, lon } = fromLocal(tree.at, ORIGIN);
        return lat >= PARK.south && lat <= PARK.north && lon >= PARK.west && lon <= PARK.east;
      });
      expect(inBox.length).toBeGreaterThanOrEqual(1800);
      expect(inBox.length).toBeLessThanOrEqual(2000);
    },
    120_000,
  );
});
