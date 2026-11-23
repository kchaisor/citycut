import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { SiteWindSelection, WindRoseAsset, WindRoseIndex, WindRoseStationRecord } from "./windRoseData";
import { indexToSelectionAsset, isWindRoseIndex } from "./windLoad";
import { siteWindSelection } from "./windStation";

export const WIND_PUBLISHED_INDEX_PATH = path.join(process.cwd(), "public/wind/australia-tmyx.json");
export const WIND_PUBLISHED_STATIONS_DIR = path.join(process.cwd(), "public/wind/stations");

export function readPublishedWindTable(): WindRoseIndex | WindRoseAsset {
  return JSON.parse(readFileSync(WIND_PUBLISHED_INDEX_PATH, "utf8")) as WindRoseIndex | WindRoseAsset;
}

export function readPublishedWindStation(stationId: string): WindRoseStationRecord {
  return JSON.parse(readFileSync(path.join(WIND_PUBLISHED_STATIONS_DIR, `${stationId}.json`), "utf8")) as WindRoseStationRecord;
}

export function publishedStationIds(): string[] {
  if (!existsSync(WIND_PUBLISHED_STATIONS_DIR)) return [];
  return readdirSync(WIND_PUBLISHED_STATIONS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

export function siteWindFromPublishedAsset(lat: number, lon: number): SiteWindSelection | null {
  const table = readPublishedWindTable();
  if (isWindRoseIndex(table)) {
    const selection = siteWindSelection(indexToSelectionAsset(table), lat, lon);
    if (!selection) return null;
    const station = readPublishedWindStation(selection.station.id);
    return {
      ...selection,
      asset: {
        version: table.version,
        speedBinEdgesMs: table.speedBinEdgesMs,
        source: table.source,
        stations: [station],
      },
    };
  }
  return siteWindSelection(table, lat, lon);
}

export function publishedStationById(stationId: string): WindRoseStationRecord | undefined {
  const table = readPublishedWindTable();
  if (isWindRoseIndex(table)) {
    if (!existsSync(path.join(WIND_PUBLISHED_STATIONS_DIR, `${stationId}.json`))) return undefined;
    return readPublishedWindStation(stationId);
  }
  return table.stations.find((station) => station.id === stationId);
}

export function publishedIndexStation(stationId: string) {
  const table = readPublishedWindTable();
  return table.stations.find((station) => station.id === stationId);
}
