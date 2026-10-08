/**
 * Regenerate committed landmark snapshot (network). Run:
 *   REFRESH_LANDMARK_SNAPSHOT=1 npx vitest run src/lib/landmarkHeights.refresh.test.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import type { LandmarkRow } from "./landmarkHeights.test";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import { loadUseTiers } from "./useCascade";
import {
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { fetchDevelopmentFloorRecords } from "./comDevelopmentFloors";
import { pickBuildingAtPoint } from "./landmarkBuildingPick";
import type { LandmarkCutSnapshot } from "./landmarkHeightPipeline";

const OUT = fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url));
const refresh = process.env.REFRESH_LANDMARK_SNAPSHOT === "1";

describe.skipIf(!refresh)("landmark snapshot refresh", () => {
  it(
    "writes landmark-heights-snapshot.json (one cut per fixture cut key)",
    async () => {
      const byCut = new Map<string, LandmarkRow>();
      for (const lm of landmarks as LandmarkRow[]) {
        if (!byCut.has(lm.cut)) byCut.set(lm.cut, lm);
      }
      const cuts: LandmarkCutSnapshot[] = [];
      const report: string[] = [];
      for (const [cutName, lm] of byCut) {
        const center = { lon: lm.lon, lat: lm.lat };
        const sideM = 450;
        const bounds = squareBBox(center, sideM);
        const comBounds = paddedComFetchBounds(center, sideM);
        const [{ buildings }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
          fetchOvertureBuildingsForCut(bounds, center, sideM),
          loadEnrichmentForCutFromDisk(bounds),
          loadUseTiers(bounds, center),
          fetchDevelopmentFloorRecords(comBounds),
          fetchComBuildingFootprintsWithStats(comBounds, center),
        ]);
        const pick = pickBuildingAtPoint(buildings, lm.lat, lm.lon, center);
        report.push(
          `${cutName}: buildings=${buildings.length} sample=${lm.name} contains=${pick ? pick.building.id : "NONE"} height=${pick?.heightM ?? "—"}`,
        );
        cuts.push({
          name: cutName,
          center,
          sideM,
          overtureBuildings: buildings,
          enrichmentRecords: [...enrichment.byId.values()],
          zones: zones ?? null,
          damRecords: dam,
          comFootprints: footprints,
        });
      }
      writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), cuts }, null, 0));
      console.info(report.join("\n"));
      console.info("Run: npx vite-node scripts/patch-landmark-snapshot-osm-ways.mjs");
      expect(cuts.length).toBe(byCut.size);
    },
    900_000,
  );
});
