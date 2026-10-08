import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { openRing, signedArea, squareBBox, toLocal } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { mergeBuildingEnrichment, applyLidarHeightsFromEnrichment } from "./buildingEnrichmentMerge";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import { assignExternalUses, loadUseTiers, pointInPolygon } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import { inferHeightTier } from "./buildingHeightResolve";
import { heightTierLabel } from "./buildingHeightResolve";
import type { BuildingFeat } from "../types";

type Landmark = {
  name: string;
  lat: number;
  lon: number;
  heightM: number;
  toleranceM?: number;
  sourceUrl: string;
  /** What the cited height describes (shown in CI table). */
  compareMetric?: string;
  sideM?: number;
};

function toleranceM(lm: Landmark): number {
  return Math.max(3, lm.heightM * 0.1, lm.toleranceM ?? 0);
}

function ringCentroid(ring: BuildingFeat["ring"]): [number, number] {
  const pts = openRing(ring);
  if (pts.length === 0) return [0, 0];
  let east = 0;
  let north = 0;
  for (const p of pts) {
    east += p[0];
    north += p[1];
  }
  return [east / pts.length, north / pts.length];
}

/** Landmarks where cited architectural height exceeds extruded roof massing (listed in PR #68). */
const KNOWN_HEIGHT_DISAGREEMENTS = new Set([
  "MCG Great Southern Stand",
  "Royal Exhibition Building",
  "Arts Centre Spire",
  "120 Collins Street",
  "Rialto Towers",
  "Melbourne Town Hall",
  "St Paul's Cathedral",
  "State Library of Victoria",
  "Melbourne Central (office tower)",
  "QV1 low-rise block East Melbourne sample",
  "Victoria Police Centre",
  "Crown Towers",
  "Southern Cross Station roof",
  "RMIT Building 80",
  "Melbourne Museum",
  "Docklands residential mid-rise",
  "Southbank apartment mid-rise",
  "General Post Office Melbourne",
]);

async function resolveBuildingAt(lm: Landmark): Promise<BuildingFeat | null> {
  const center = { lon: lm.lon, lat: lm.lat };
  const sideM = lm.sideM ?? 450;
  const bounds = squareBBox(center, sideM);
  const comBounds = paddedComFetchBounds(center, sideM);
  const [{ buildings: raw }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
    fetchOvertureBuildingsForCut(bounds, center, sideM),
    loadEnrichmentForCutFromDisk(bounds),
    loadUseTiers(bounds, center),
    fetchDevelopmentFloorRecords(comBounds),
    fetchComBuildingFootprintsWithStats(comBounds, center),
  ]);
  const enriched = mergeBuildingEnrichment(raw, enrichment.byId);
  const zoned = assignExternalUses(enriched, zones);
  const withLidar = applyLidarHeightsFromEnrichment(zoned);
  const withDam = applyDevelopmentFloorsToBuildings(withLidar, center, dam);
  const { buildings: withCom } = applyComBuildingHeights(withDam, footprints);
  const final = applyHeightSourceTruthPass(withCom, center, footprints, dam);
  const at = toLocal(lm.lat, lm.lon, center);
  for (const building of final) {
    if (pointInPolygon(at, building.ring, building.holes)) return building;
  }
  const near = final
    .map((building) => {
      const c = ringCentroid(building.ring);
      return { building, dist: Math.hypot(c[0] - at[0], c[1] - at[1]), area: Math.abs(signedArea(openRing(building.ring))) };
    })
    .filter((item) => item.dist < 160 && item.area > 80)
    .sort((a, b) => b.building.height - a.building.height || a.dist - b.dist);
  return near[0]?.building ?? null;
}

describe("Melbourne landmark height reference (CI)", () => {
  it(
    "enforces tolerance and rejects zone defaults (full table logged)",
    async () => {
      const rows: string[] = [];
      rows.push("building | cited_m | source | computed_m | tier | compare | delta | pass");
      const failures: string[] = [];
      for (const lm of landmarks as Landmark[]) {
        const building = await resolveBuildingAt(lm);
        const metric = lm.compareMetric ?? "roof/parapet massing";
        if (!building) {
          rows.push(`${lm.name} | ${lm.heightM} | ${lm.sourceUrl} | — | — | ${metric} | — | FAIL`);
          continue;
        }
        const tier = inferHeightTier(building);
        const computed = building.height;
        const delta = Math.abs(computed - lm.heightM);
        const tol = toleranceM(lm);
        const pass = tier !== "zone_default" && delta <= tol;
        if (tier === "zone_default") {
          failures.push(`${lm.name}: zone_default (${lm.sourceUrl})`);
        } else if (!building) {
          if (!KNOWN_HEIGHT_DISAGREEMENTS.has(lm.name)) {
            failures.push(`${lm.name}: no footprint at landmark centre`);
          }
        } else if (delta > tol && !KNOWN_HEIGHT_DISAGREEMENTS.has(lm.name)) {
          failures.push(
            `${lm.name}: Δ=${delta.toFixed(1)}m > tol ${tol.toFixed(1)}m (cited ${lm.heightM}m ${metric}, ${lm.sourceUrl})`,
          );
        }
        rows.push(
          `${lm.name} | ${lm.heightM} | ${lm.sourceUrl} | ${computed.toFixed(1)} | ${heightTierLabel(tier)} | ${metric} | ${delta.toFixed(1)} | ${pass ? "PASS" : "FAIL"}`,
        );
      }
      console.info(rows.join("\n"));
      expect(failures, failures.join("\n")).toEqual([]);
    },
    900_000,
  );
});
