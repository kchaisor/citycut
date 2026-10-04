/**
 * Five CBD towers: per-tower Overture frame + CoM (same spot check as PR #37).
 * Run: npx vite-node scripts/report-tower-heights.mjs
 */
import {
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
  tallestExtrusionHeight,
} from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { openRing, toLocal } from "../src/lib/geo.ts";
import {
  fetchOvertureBuildingsForCut,
  findOvertureBuildingByOsmWayId,
  findOvertureBuildingForOsmFootprint,
} from "../src/lib/overtureBuildings.ts";

const TOWER_SIDE_M = 400;
const TOWER_PAD_DEG = 0.0018;

const towers = [
  { name: "Rialto", osmWayId: 14665796, expect: 245.5 },
  { name: "Aurora", osmWayId: 114114375, expect: 270.2 },
  { name: "Eureka", osmWayId: 13307317, expect: 297.5 },
  { name: "101 Collins", osmWayId: 140834631, expect: 194 },
  { name: "120 Collins", osmWayId: 22931324, expect: 184.5 },
];

async function loadWay(id) {
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/way/${id}/full`);
  const xml = await res.text();
  const nodes = new Map();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*lat="([^"]+)" lon="([^"]+)"/g)) {
    nodes.set(Number(m[1]), { lat: Number(m[2]), lon: Number(m[3]) });
  }
  const block = xml.match(new RegExp(`<way id="${id}"[\\s\\S]*?</way>`));
  if (!block) throw new Error(`way ${id} missing`);
  const coords = [];
  for (const nd of block[0].matchAll(/<nd ref="(\d+)"/g)) {
    const node = nodes.get(Number(nd[1]));
    if (node) coords.push(node);
  }
  return coords;
}

const rows = [];
for (const tower of towers) {
  const coords = await loadWay(tower.osmWayId);
  const meanLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const meanLon = coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;
  const origin = { lon: meanLon, lat: meanLat };
  const at = toLocal(meanLat, meanLon, origin);
  const towerBounds = {
    south: meanLat - TOWER_PAD_DEG,
    north: meanLat + TOWER_PAD_DEG,
    west: meanLon - TOWER_PAD_DEG,
    east: meanLon + TOWER_PAD_DEG,
  };
  const { buildings } = await fetchOvertureBuildingsForCut(towerBounds, origin, TOWER_SIDE_M);
  const seedRing = openRing(coords.map((c) => toLocal(c.lat, c.lon, origin)));
  const seed = { ring: seedRing, holes: [] };
  const bySource = findOvertureBuildingByOsmWayId(buildings, tower.osmWayId);
  const match = bySource ?? findOvertureBuildingForOsmFootprint(buildings, seed, at);
  const { footprints } = await fetchComBuildingFootprintsWithStats(
    paddedComFetchBounds(origin, TOWER_SIDE_M),
    origin,
  );
  const { buildings: withCom } = await runComBuildingHeightsInWorker(
    match ? [match] : [],
    footprints,
  );
  const com = withCom[0] ?? null;
  rows.push({
    name: tower.name,
    frame_m: TOWER_SIDE_M,
    osm_way: tower.osmWayId,
    expect_m: tower.expect,
    match: bySource ? "sources" : match ? "geometry" : "none",
    overture_m: match ? Math.round(match.height * 10) / 10 : null,
    com_m: com ? Math.round(tallestExtrusionHeight(com) * 10) / 10 : null,
  });
}

console.log(JSON.stringify({ rows }, null, 2));
