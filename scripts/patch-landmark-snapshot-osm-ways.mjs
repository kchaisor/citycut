/**
 * Attach verified OSM way ids to Overture buildings at landmark points in the committed snapshot.
 * Run: node scripts/patch-landmark-snapshot-osm-ways.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snapshotPath = "src/lib/fixtures/landmark-heights-snapshot.json";
const landmarksPath = "src/lib/fixtures/landmark-heights.json";

// Vitest/ts path — use dynamic import via vite-node is heavy; duplicate minimal pick in JS below.
import { openRing, signedArea, toLocal } from "../src/lib/geo.ts";
import { pointInPolygon } from "../src/lib/useCascade.ts";
import { resolveLandmarkCut } from "../src/lib/landmarkHeightPipeline.ts";
import { pickBuildingAtPoint } from "../src/lib/landmarkBuildingPick.ts";

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const landmarks = JSON.parse(readFileSync(landmarksPath, "utf8"));

const report = [];
for (const lm of landmarks) {
  const cut = snapshot.cuts.find((c) => c.name === lm.cut);
  if (!cut) {
    report.push(`${lm.name}: missing cut ${lm.cut}`);
    continue;
  }
  const final = resolveLandmarkCut(cut);
  const pick = pickBuildingAtPoint(final, lm.lat, lm.lon, cut.center);
  if (!pick) {
    report.push(`${lm.name}: no building at point`);
    continue;
  }
  const raw = cut.overtureBuildings.find((b) => b.id === pick.building.id);
  if (!raw) {
    report.push(`${lm.name}: building ${pick.building.id} missing from cut`);
    continue;
  }
  if (!raw.osmWayIds) raw.osmWayIds = [];
  if (!raw.osmWayIds.includes(lm.osm.id)) {
    raw.osmWayIds.push(lm.osm.id);
    report.push(`${lm.name}: added osm way ${lm.osm.id} to building ${raw.id} (had ${pick.building.osmWayIds?.join(",") ?? "—"})`);
  }
}

writeFileSync(snapshotPath, JSON.stringify(snapshot));
console.info(report.join("\n") || "No patches needed");
