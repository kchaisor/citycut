/**
 * CBD tower heights (CoM 2023 on Overture). Run: npx vite-node scripts/report-tower-heights.mjs
 */
import {
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
  tallestExtrusionHeight,
} from "../src/lib/comBuildingHeights.ts";
import { intersectionAreaM2 } from "../src/lib/comBuildingHeightsMatch.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { openRing, squareBBox, toLocal } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);

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

function centroid(ring) {
  const points = openRing(ring);
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
  }
  return [x / points.length, y / points.length];
}

function matchOverture(seedRing, list) {
  const seed = { ring: seedRing, holes: [] };
  let best = null;
  let bestArea = 0;
  for (const building of list) {
    const area = intersectionAreaM2(seed, building);
    if (area > bestArea) {
      bestArea = area;
      best = building;
    }
  }
  if (best && bestArea > 4) return best;
  const at = centroid(seedRing);
  let nearest = null;
  let nearestD = 80;
  for (const building of list) {
    const c = centroid(building.ring);
    const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
    if (d < nearestD) {
      nearestD = d;
      nearest = building;
    }
  }
  return nearest;
}

const { buildings } = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
const { footprints } = await fetchComBuildingFootprintsWithStats(paddedComFetchBounds(center, sideM), center);
const { buildings: withCom } = await runComBuildingHeightsInWorker(buildings, footprints);
const byId = new Map(withCom.map((building) => [building.id, building]));

const rows = [];
for (const tower of towers) {
  const coords = await loadWay(tower.osmWayId);
  const seedRing = openRing(coords.map((c) => toLocal(c.lat, c.lon, center)));
  const match = matchOverture(seedRing, buildings);
  const com = match ? byId.get(match.id) ?? matchOverture(seedRing, withCom) : null;
  rows.push({
    name: tower.name.replace(" Tower", "").replace(" Street", ""),
    expect_m: tower.expect,
    overture_m: match ? Math.round(match.height * 10) / 10 : null,
    com_m: com ? Math.round(tallestExtrusionHeight(com) * 10) / 10 : null,
  });
}

console.log(JSON.stringify({ rows }, null, 2));
