import { comRecordsToTrees, fetchComTrees } from "../src/lib/comTrees.ts";
import { fetchOvertureBaseForCut } from "../src/lib/overtureBase.ts";
import { fetchVicmapTrees, vicmapPointsToTrees } from "../src/lib/vicmapTrees.ts";
import { assembleTreeTiers, capTreeInstances } from "../src/lib/treeTiers.ts";
import { fromLocal } from "../src/lib/geo.ts";

const ORIGIN = { lat: -37.81313, lon: 144.98122 };
const SIDE_M = 1000;
const PARK = { south: -37.8165, north: -37.8105, west: 144.9775, east: 144.983 };
const bounds = {
  south: ORIGIN.lat - SIDE_M / 2 / 111_000,
  north: ORIGIN.lat + SIDE_M / 2 / 111_000,
  west: ORIGIN.lon - SIDE_M / 2 / 85_000,
  east: ORIGIN.lon + SIDE_M / 2 / 85_000,
};
const [com, vicmap, base] = await Promise.all([
  fetchComTrees(bounds),
  fetchVicmapTrees(bounds),
  fetchOvertureBaseForCut(bounds, ORIGIN, SIDE_M, { waterGreen: true, trees: true, frameShape: "square" }),
]);
const assembled = assembleTreeTiers({
  com: comRecordsToTrees(com, ORIGIN, SIDE_M, "square"),
  osm: base.overtureTrees,
  vicmap: vicmapPointsToTrees(vicmap, ORIGIN, SIDE_M, "square"),
  canopy: base.treeContext.canopy,
  buildings: base.treeContext.buildings,
  water: base.treeContext.water,
  roads: base.treeContext.roads,
});
const inBox = assembled.trees.filter((tree) => {
  const { lat, lon } = fromLocal(tree.at, ORIGIN);
  return lat >= PARK.south && lat <= PARK.north && lon >= PARK.west && lon <= PARK.east;
});
console.log(JSON.stringify({ total: assembled.trees.length, inBox: inBox.length }, null, 2));
