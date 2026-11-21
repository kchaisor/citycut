import type { WikidataBbox, WikidataLandmark } from "../../shared/wikidataLandmarks.js";
import { M_PER_DEG_LAT, mPerDegLon, toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { BuildingFeat, CityModel } from "../types";

export type WikidataMatch = { buildingId: number; item: WikidataLandmark };

export type WikidataLandmarksResult =
  | {
      status: "ok";
      source: "baked" | "live";
      generatedAt: string | null;
      matches: WikidataMatch[];
      inCut: number;
      noFootprint: number;
      manyFootprints: number;
    }
  | { status: "failed"; reason: string };

export function cutBbox(model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM">): WikidataBbox {
  const dLon = (model.widthM ?? model.sideM) / 2 / mPerDegLon(model.center.lat);
  const dLat = (model.heightM ?? model.sideM) / 2 / M_PER_DEG_LAT;
  return { west: model.center.lon - dLon, south: model.center.lat - dLat, east: model.center.lon + dLon, north: model.center.lat + dLat };
}

export function bboxContains(outer: WikidataBbox, inner: WikidataBbox): boolean {
  return inner.west >= outer.west && inner.east <= outer.east && inner.south >= outer.south && inner.north <= outer.north;
}

function inBbox(item: Pick<WikidataLandmark, "lon" | "lat">, bbox: WikidataBbox): boolean {
  return item.lon >= bbox.west && item.lon <= bbox.east && item.lat >= bbox.south && item.lat <= bbox.north;
}

function buildingsForItem(model: Pick<CityModel, "center" | "buildings">, item: WikidataLandmark): BuildingFeat[] {
  const ways = new Set(item.osmWayIds ?? []);
  const byWay = ways.size > 0 ? model.buildings.filter((b) => b.osmWayIds?.some((id) => ways.has(id))) : [];
  if (byWay.length === 1) return byWay;
  const at = toLocal(item.lat, item.lon, model.center);
  return (byWay.length > 1 ? byWay : model.buildings).filter((b) => pointInPolygon(at, b.ring, b.holes));
}

export function matchLandmarks(
  model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM" | "buildings">,
  items: readonly WikidataLandmark[],
  source: "baked" | "live",
  generatedAt: string | null,
): WikidataLandmarksResult {
  const bbox = cutBbox(model);
  const matches: WikidataMatch[] = [];
  let inCut = 0;
  let noFootprint = 0;
  let manyFootprints = 0;
  for (const item of items) {
    if (!inBbox(item, bbox)) continue;
    inCut += 1;
    const containing = buildingsForItem(model, item);
    if (containing.length === 0) noFootprint += 1;
    else if (containing.length > 1) manyFootprints += 1;
    else matches.push({ buildingId: containing[0]!.id, item });
  }
  return { status: "ok", source, generatedAt, matches, inCut, noFootprint, manyFootprints };
}

export type WikidataHeightGap = {
  qid: string;
  name: string;
  buildingId: number;
  modelHeightM: number;
  citedHeightM: number;
  gapFraction: number;
};

export function closestCitedHeight(item: Pick<WikidataLandmark, "heightsM">, modelHeightM: number): number | null {
  if (item.heightsM.length === 0) return null;
  return item.heightsM.reduce((best, h) => (Math.abs(h - modelHeightM) < Math.abs(best - modelHeightM) ? h : best));
}

export function wikidataHeightGaps(
  buildings: readonly Pick<BuildingFeat, "id" | "height">[],
  matches: readonly WikidataMatch[],
  tolerance = 0.1,
): WikidataHeightGap[] {
  const heightById = new Map(buildings.map((b) => [b.id, b.height]));
  const gaps: WikidataHeightGap[] = [];
  for (const { buildingId, item } of matches) {
    const modelHeightM = heightById.get(buildingId);
    if (modelHeightM === undefined) continue;
    const cited = closestCitedHeight(item, modelHeightM);
    if (cited === null || cited <= 0) continue;
    const gapFraction = Math.abs(modelHeightM - cited) / cited;
    if (gapFraction > tolerance) {
      gaps.push({ qid: item.qid, name: item.name, buildingId, modelHeightM, citedHeightM: cited, gapFraction: Math.round(gapFraction * 1000) / 1000 });
    }
  }
  return gaps;
}
