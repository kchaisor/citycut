/**
 * Regenerate committed landmark snapshot (network). Run:
 *   REFRESH_LANDMARK_SNAPSHOT=1 npx vitest run src/lib/landmarkHeights.refresh.test.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import landmarks from "./fixtures/landmark-heights.json";
import { snapshotCutName } from "./landmarkSnapshotAliases";
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
    "writes landmark-heights-snapshot.json",
    async () => {
      const cuts: LandmarkCutSnapshot[] = [];
      const report: string[] = [];
      for (const lm of landmarks as {
        name: string;
        lat: number;
        lon: number;
        sideM?: number;
      }[]) {
        const center = { lon: lm.lon, lat: lm.lat };
        const sideM = lm.sideM ?? 450;
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
          `${lm.name}: buildings=${buildings.length} contains=${pick ? pick.building.id : "NONE"} height=${pick?.heightM ?? "—"}`,
        );
        cuts.push({
          name: snapshotCutName(lm.name),
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
      expect(cuts.length).toBe(landmarks.length);
    },
    900_000,
  );
});
