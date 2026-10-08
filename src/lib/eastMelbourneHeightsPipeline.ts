import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { loadUseTiers } from "./useCascade";
import {
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import { fetchDevelopmentFloorRecords, type DamFloorRecord } from "./comDevelopmentFloors";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { BuildingFeat, LonLat } from "../types";
import type { ZonePolygon } from "./useCascade";
import {
  modelPageDisplayBuildings,
  modelPageHeightSignature,
} from "./modelPageDisplayBuildings";

export const EAST_MELBOURNE_HEIGHT_CUT = {
  lat: -37.8127,
  lon: 144.98061,
  km: 1,
} as const;

const INPUT_FIXTURE = fileURLToPath(
  new URL("./fixtures/east-melbourne-heights-input.json", import.meta.url),
);

export type EastMelbourneHeightInputs = {
  center: LonLat;
  sideM: number;
  overtureBuildings: BuildingFeat[];
  enrichmentById: Record<string, BuildingEnrichmentRecord>;
  zones: ZonePolygon[] | null;
  damRecords: DamFloorRecord[];
  comFootprints: ComBuildingFootprint[];
};

export function applyEastMelbourneDisplayHeights(input: EastMelbourneHeightInputs): BuildingFeat[] {
  return modelPageDisplayBuildings(input);
}

export function loadEastMelbourneHeightInputsFromFixture(): EastMelbourneHeightInputs {
  return JSON.parse(readFileSync(INPUT_FIXTURE, "utf8")) as EastMelbourneHeightInputs;
}

export async function fetchEastMelbourneHeightInputs(
  center: LonLat = { lat: EAST_MELBOURNE_HEIGHT_CUT.lat, lon: EAST_MELBOURNE_HEIGHT_CUT.lon },
  km = EAST_MELBOURNE_HEIGHT_CUT.km,
): Promise<EastMelbourneHeightInputs> {
  const sideM = km * 1000;
  const bounds = squareBBox(center, sideM);
  const comBounds = paddedComFetchBounds(center, sideM);
  const [{ buildings: raw }, enrichment, { zones }, dam, { footprints }] = await Promise.all([
    fetchOvertureBuildingsForCut(bounds, center, sideM),
    loadEnrichmentForCutFromDisk(bounds),
    loadUseTiers(bounds, center),
    fetchDevelopmentFloorRecords(comBounds),
    fetchComBuildingFootprintsWithStats(comBounds, center),
  ]);
  return {
    center,
    sideM,
    overtureBuildings: raw,
    enrichmentById: Object.fromEntries(enrichment.byId.entries()),
    zones,
    damRecords: dam,
    comFootprints: footprints,
  };
}

export async function refreshEastMelbourneHeightFixtures(): Promise<void> {
  const input = await fetchEastMelbourneHeightInputs();
  const display = applyEastMelbourneDisplayHeights(input);
  const signature = modelPageHeightSignature(display);
  writeFileSync(INPUT_FIXTURE, `${JSON.stringify(input)}\n`);
  writeFileSync(
    fileURLToPath(new URL("./fixtures/east-melbourne-heights-main.json", import.meta.url)),
    `${JSON.stringify(
      {
        cut: EAST_MELBOURNE_HEIGHT_CUT,
        buildingCount: signature.length,
        buildings: signature,
      },
      null,
      2,
    )}\n`,
  );
}

/** @deprecated use modelPageHeightSignature */
export function buildingHeightSignature(buildings: BuildingFeat[]): { id: number; heightM: number }[] {
  return modelPageHeightSignature(buildings);
}
