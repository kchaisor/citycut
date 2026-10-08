import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { squareBBox } from "./geo";
import { fetchOvertureBuildingsForCut } from "./overtureBuildings";
import { assignExternalUses, loadUseTiers } from "./useCascade";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "./comBuildingHeights";
import {
  applyDevelopmentFloorsToBuildings,
  fetchDevelopmentFloorRecords,
  type DamFloorRecord,
} from "./comDevelopmentFloors";
import { applyHeightSourceTruthPass } from "./buildingHeightSourceTruth";
import {
  applyLidarHeightsFromEnrichment,
  mergeBuildingEnrichment,
} from "./buildingEnrichmentMerge";
import { effectiveBuildingHeightM } from "./buildingHeightResolve";
import { loadEnrichmentForCutFromDisk } from "./test/loadEnrichmentForCut";
import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { BuildingFeat, LonLat } from "../types";
import type { ZonePolygon } from "./useCascade";

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

export function applyEastMelbourneHeightPipeline(input: EastMelbourneHeightInputs): BuildingFeat[] {
  const byId = new Map(Object.entries(input.enrichmentById));
  const enriched = mergeBuildingEnrichment(input.overtureBuildings, byId);
  const zoned = assignExternalUses(enriched, input.zones);
  const withLidar = applyLidarHeightsFromEnrichment(zoned);
  const withDam = applyDevelopmentFloorsToBuildings(withLidar, input.center, input.damRecords);
  const { buildings: withCom } = applyComBuildingHeights(withDam, input.comFootprints);
  return applyHeightSourceTruthPass(withCom, input.center, input.comFootprints, input.damRecords);
}

export function loadEastMelbourneHeightInputsFromFixture(): EastMelbourneHeightInputs {
  return JSON.parse(readFileSync(INPUT_FIXTURE, "utf8")) as EastMelbourneHeightInputs;
}

/** Same height resolution order as model create (App) for a Melbourne building cut. */
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

export async function buildEastMelbourneDisplayHeights(
  center: LonLat = { lat: EAST_MELBOURNE_HEIGHT_CUT.lat, lon: EAST_MELBOURNE_HEIGHT_CUT.lon },
  km = EAST_MELBOURNE_HEIGHT_CUT.km,
): Promise<BuildingFeat[]> {
  const input = await fetchEastMelbourneHeightInputs(center, km);
  return applyEastMelbourneHeightPipeline(input);
}

export async function refreshEastMelbourneHeightFixtures(): Promise<void> {
  const input = await fetchEastMelbourneHeightInputs();
  const display = applyEastMelbourneHeightPipeline(input);
  const signature = buildingHeightSignature(display);
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

export function buildingHeightSignature(buildings: BuildingFeat[]): { id: number; heightM: number }[] {
  return buildings
    .map((building) => ({
      id: building.id,
      heightM: Math.round(effectiveBuildingHeightM(building) * 1000) / 1000,
    }))
    .sort((a, b) => a.id - b.id);
}
