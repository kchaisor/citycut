/**
 * Height-cap scope study for Mont Albert North and Melbourne CBD (1 km frames).
 * Run: npx tsx scripts/report-height-cap-scope.mjs
 */
import fs from "node:fs";
import { assignExternalUses, footprintArea, interiorPoint, loadUseTiers, zoneCodesForBuildings } from "../src/lib/useCascade.ts";
import { fetchOvertureBuildingRecordsForCut } from "../src/lib/overtureBuildings.ts";
import { fromLocal, squareBBox } from "../src/lib/geo.ts";

function normaliseZoneCode(code) {
  return code.trim().toUpperCase().replace(/\d+$/, "");
}
import {
  PROPOSED_ZONE_HEIGHT_CAP_M,
  applyZoneHeightCaps,
  heightCapWouldApply,
  zoneHeightCapM,
} from "../src/lib/buildingHeightCap.ts";

const FRAMES = [
  { label: "Mont Albert North", lat: -37.803, lon: 145.106 },
  { label: "Melbourne CBD", lat: -37.8136, lon: 144.9631 },
];
const sideM = 1000;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function heightStats(heights) {
  const sorted = heights.slice().sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? null,
    over9: sorted.filter((h) => h > 9).length,
    over12: sorted.filter((h) => h > 12).length,
    over15: sorted.filter((h) => h > 15).length,
  };
}

function sourceBucket(record) {
  const labels = record.sourceDatasets.join(" ").toLowerCase();
  if (record.mlFootprintOnly) {
    if (labels.includes("google")) return "google_ml";
    if (labels.includes("microsoft")) return "microsoft_ml";
    return "ml_other";
  }
  if (record.building.osmWayIds?.length) return "osm";
  if (labels.includes("esri")) return "esri";
  if (labels.includes("microsoft")) return "microsoft_mixed";
  if (labels.includes("google")) return "google_mixed";
  if (record.sourceDatasets.length === 0) return "unknown";
  return "other";
}

async function analyzeFrame(frame) {
  const center = { lon: frame.lon, lat: frame.lat };
  const bounds = squareBBox(center, sideM);
  const { records, stats, buildingCapHit } = await fetchOvertureBuildingRecordsForCut(bounds, center, sideM);
  const tiers = await loadUseTiers(bounds, center);
  const buildingsBefore = records.map((r) => r.building);
  const buildings = assignExternalUses(buildingsBefore, tiers.zones);
  const zoneCodes = zoneCodesForBuildings(buildings, tiers.zones);

  const rows = records.map((record, i) => {
    const building = buildings[i];
    const zoneCode = zoneCodes[i];
    const zoneNorm = zoneCode ? normaliseZoneCode(zoneCode) : null;
    const at = interiorPoint(building.ring, building.holes);
    const centroid = fromLocal(at, center);
    return {
      overtureId: building.overtureId,
      height: building.height,
      heightMethod: building.heightFromFallback ? "fallback" : record.heightMethod,
      heightFromFallback: Boolean(building.heightFromFallback),
      sourceDatasets: record.sourceDatasets,
      geometrySource: record.geometrySource,
      sourceBucket: sourceBucket(record),
      mlFootprintOnly: record.mlFootprintOnly,
      zoneCode,
      zoneNorm,
      footprintAreaM2: footprintArea(building.ring, building.holes),
      lat: centroid.lat,
      lon: centroid.lon,
      osmWayIds: building.osmWayIds ?? [],
    };
  });

  const byZone = {};
  const bySource = {};
  const byZoneSource = {};
  for (const row of rows) {
    const z = row.zoneNorm ?? "NO_ZONE";
    const s = row.sourceBucket;
    if (!byZone[z]) byZone[z] = [];
    byZone[z].push(row.height);
    if (!bySource[s]) bySource[s] = [];
    bySource[s].push(row.height);
    const key = `${z}|${s}`;
    if (!byZoneSource[key]) byZoneSource[key] = [];
    byZoneSource[key].push(row.height);
  }

  const distributions = {
    byZone: Object.fromEntries(Object.entries(byZone).map(([k, v]) => [k, heightStats(v)])),
    bySource: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, heightStats(v)])),
  };

  function tallestInZone(zoneNorm, n = 10) {
    return rows
      .filter((r) => r.zoneNorm === zoneNorm)
      .sort((a, b) => b.height - a.height)
      .slice(0, n)
      .map((r) => ({
        height: r.height,
        heightMethod: r.heightMethod,
        sourceDatasets: r.sourceDatasets,
        sourceBucket: r.sourceBucket,
        footprintAreaM2: Math.round(r.footprintAreaM2),
        lat: r.lat,
        lon: r.lon,
        overtureId: r.overtureId,
      }));
  }

  const targets = records.map((record) => ({
    heightMethod: record.heightMethod,
    mlFootprintOnly: record.mlFootprintOnly,
    hasOsmWay: (record.building.osmWayIds?.length ?? 0) > 0,
  }));

  const capModes = ["ml_footprint_only", "non_osm_height", "all_overture"];
  const capImpact = {};
  for (const mode of capModes) {
    const capped = applyZoneHeightCaps(buildings, zoneCodes, mode, targets);
    const touched = [];
    for (let i = 0; i < buildings.length; i++) {
      if (!heightCapWouldApply(mode, targets[i])) continue;
      const cap = zoneHeightCapM(zoneCodes[i]);
      if (cap === null) continue;
      if (buildings[i].height <= cap) continue;
      touched.push({
        zoneNorm: zoneCodes[i] ? normaliseZoneCode(zoneCodes[i]) : "NO_ZONE",
        sourceBucket: sourceBucket(records[i]),
        before: buildings[i].height,
        after: capped[i].height,
        cap,
      });
    }
    const byZoneTouch = {};
    const bySourceTouch = {};
    for (const item of touched) {
      byZoneTouch[item.zoneNorm] = (byZoneTouch[item.zoneNorm] ?? 0) + 1;
      bySourceTouch[item.sourceBucket] = (bySourceTouch[item.sourceBucket] ?? 0) + 1;
    }
    capImpact[mode] = { total: touched.length, byZone: byZoneTouch, bySource: bySourceTouch };
  }

  const heightMethodCounts = rows.reduce((acc, row) => {
    acc[row.heightMethod] = (acc[row.heightMethod] ?? 0) + 1;
    return acc;
  }, {});

  return {
    label: frame.label,
    center,
    sideM,
    overtureRelease: stats.release,
    buildingCount: rows.length,
    buildingCapHit,
    zoneFetchOk: Boolean(tiers.zones?.length),
    heightMethodCounts,
    distributions,
    tallestNRZ: tallestInZone("NRZ"),
    tallestGRZ: tallestInZone("GRZ"),
    proposedCaps: PROPOSED_ZONE_HEIGHT_CAP_M,
    capImpact,
    rows,
  };
}

const results = [];
for (const frame of FRAMES) {
  console.error(`Analyzing ${frame.label}…`);
  results.push(await analyzeFrame(frame));
}

const outJson = "/opt/cursor/artifacts/height-cap-data.json";
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ outJson, frames: results.map((r) => ({ label: r.label, buildings: r.buildingCount })) }));
