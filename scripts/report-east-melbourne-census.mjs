import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { assignExternalUses, loadUseTiers } from "../src/lib/useCascade.ts";
import {
  applyComBuildingHeights,
  fetchComBuildingFootprintsWithStats,
  paddedComFetchBounds,
} from "../src/lib/comBuildingHeights.ts";
import { applyDevelopmentFloorsToBuildings, fetchDevelopmentFloorRecords } from "../src/lib/comDevelopmentFloors.ts";
import { inferHeightTier } from "../src/lib/buildingHeightResolve.ts";
import { applyHeightSourceTruthPass } from "../src/lib/buildingHeightSourceTruth.ts";
import {
  applyLidarHeightsFromEnrichment,
  countUseSourceTiers,
  mergeBuildingEnrichment,
} from "../src/lib/buildingEnrichmentMerge.ts";
import { fetchBuildingEnrichmentForCut } from "../src/lib/buildingEnrichmentTiles.ts";
import { computeCityBlocks } from "../src/lib/cityBlocks.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import { layerCountsForModel } from "../src/lib/layerDuplicateAudit.ts";

const lat = -37.8127;
const lon = 144.98061;
const km = 1;
const center = { lon, lat };
const sideM = km * 1000;
const bounds = squareBBox(center, sideM);
const comBounds = paddedComFetchBounds(center, sideM);

function heightCensus(buildings) {
  const counts = {};
  for (const b of buildings) {
    const t = inferHeightTier(b);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

async function pipeline(useEnrichment) {
  const [{ buildings: raw }, enrichment, { zones }, dam, { footprints }, transport] = await Promise.all([
    fetchOvertureBuildingsForCut(bounds, center, sideM),
    useEnrichment ? fetchBuildingEnrichmentForCut(bounds) : Promise.resolve({ byId: new Map() }),
    loadUseTiers(bounds, center),
    fetchDevelopmentFloorRecords(comBounds),
    fetchComBuildingFootprintsWithStats(comBounds, center),
    fetchOvertureTransportationForCut(bounds, center, sideM),
  ]);
  let zoned = assignExternalUses(raw, zones);
  if (useEnrichment) {
    zoned = mergeBuildingEnrichment(zoned, enrichment.byId);
    zoned = applyLidarHeightsFromEnrichment(zoned);
  }
  const withDam = applyDevelopmentFloorsToBuildings(zoned, center, dam);
  const { buildings: withCom } = applyComBuildingHeights(withDam, footprints);
  const final = applyHeightSourceTruthPass(withCom, center, footprints, dam);
  const model = {
    center,
    sideM,
    buildings: final,
    roads: transport.roads,
    areas: [],
    trees: [],
    roadKm: transport.roadKm,
    buildingCapHit: false,
    sourceNote: "",
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    blocks: computeCityBlocks({ roads: transport.roads, areas: [], sideM }),
  };
  return { buildings: final, model, useSources: countUseSourceTiers(final) };
}

const legacy = await pipeline(false);
const enriched = await pipeline(true);

console.log(JSON.stringify({
  eastMelbourne: { lat, lon, km },
  useSourceBefore: legacy.useSources,
  useSourceAfter: enriched.useSources,
  heightTierBefore: heightCensus(legacy.buildings),
  heightTierAfter: heightCensus(enriched.buildings),
  dedupeAfter: layerCountsForModel(enriched.model),
}, null, 2));
