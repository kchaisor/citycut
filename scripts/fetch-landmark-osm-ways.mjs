/**
 * Fetch OSM way geometry for landmark CI (run once when fixture changes):
 *   npx vite-node scripts/fetch-landmark-osm-ways.mjs
 */
import { writeFileSync } from "node:fs";
import landmarks from "../src/lib/fixtures/landmark-heights.json" assert { type: "json" };

const OUT = "src/lib/fixtures/landmark-osm-ways.json";
const USER_AGENT = "CityCut/1.0 (https://github.com/kchaisor/citycut; landmark fixture)";

async function fetchWay(id) {
  const url = `https://api.openstreetmap.org/api/0.6/way/${id}/full.json`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`OSM way ${id} HTTP ${response.status}`);
  const data = await response.json();
  const nodes = new Map();
  let way = null;
  for (const element of data.elements ?? []) {
    if (element.type === "node") nodes.set(element.id, [element.lon, element.lat]);
    if (element.type === "way" && element.id === id) way = element;
  }
  if (!way) throw new Error(`OSM way ${id} missing from response`);
  const ringLonLat = way.nodes.map((nodeId) => {
    const coord = nodes.get(nodeId);
    if (!coord) throw new Error(`OSM way ${id} missing node ${nodeId}`);
    return coord;
  });
  return {
    id: way.id,
    version: way.version ?? null,
    tags: way.tags ?? {},
    ringLonLat,
  };
}

const ids = [...new Set(landmarks.map((row) => row.osm.id))];
const ways = {};
for (const id of ids) {
  ways[String(id)] = await fetchWay(id);
  await new Promise((resolve) => setTimeout(resolve, 1100));
}

writeFileSync(OUT, `${JSON.stringify({ fetchedAt: new Date().toISOString(), ways }, null, 2)}\n`);
console.info(`Wrote ${Object.keys(ways).length} ways to ${OUT}`);
