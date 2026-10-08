/**
 * Regenerate committed landmark snapshot (network). Run:
 *   REFRESH_LANDMARK_SNAPSHOT=1 npx vitest run src/lib/landmarkHeights.refresh.test.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import type { LandmarkRow } from "./landmarkHeights.test";
import { landmarkCutBounds } from "./landmarkCutBounds";
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
      const byCut = new Map<string, LandmarkRow[]>();
      for (const lm of landmarks as LandmarkRow[]) {
        const list = byCut.get(lm.cut) ?? [];
        list.push(lm);
        byCut.set(lm.cut, list);
      }
      const cuts: LandmarkCutSnapshot[] = [];
      const report: string[] = [];
      for (const [cutName, cutRows] of byCut) {
        const { center, sideM } = landmarkCutBounds(cutRows);
        const bounds = squareBBox(center, sideM);
        const comBounds = paddedComFetchBounds(center, sideM);
        const [{ buildings }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
          fetchOvertureBuildingsForCut(bounds, center, sideM),
          loadEnrichmentForCutFromDisk(bounds),
          loadUseTiers(bounds, center),
          fetchDevelopmentFloorRecords(comBounds),
          fetchComBuildingFootprintsWithStats(comBounds, center),
        ]);
        const sample = cutRows[0]!;
        const pick = pickBuildingAtPoint(buildings, sample.lat, sample.lon, center);
        report.push(
          `${cutName}: side=${sideM}m center=${center.lat.toFixed(5)},${center.lon.toFixed(5)} buildings=${buildings.length} sample=${sample.name} pick=${pick ? pick.building.id : "NONE"}`,
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
      console.info("Run: npx vite-node scripts/fetch-landmark-osm-ways.mjs");
      console.info("Run: npx vite-node scripts/write-landmark-computed-sidecar.mjs");
      expect(cuts.length).toBe(byCut.size);
    },
    900_000,
  );
});
