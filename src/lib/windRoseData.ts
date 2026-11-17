import type { WindPeriodId } from "./windRose";
import { CALM_SPEED_MS, WIND_SPEED_BIN_EDGES_MS } from "./windBins";

export const WIND_ROSE_ASSET_VERSION = 2;
export const WIND_ROSE_SUPPORTED_ASSET_VERSIONS: readonly number[] = [1, WIND_ROSE_ASSET_VERSION];
export { CALM_SPEED_MS, WIND_SPEED_BIN_EDGES_MS };
export const WIND_ROSE_SOURCE = "climate.onebuilding.org TMYx EPW";

export type WindRoseSeasonId = Exclude<WindPeriodId, `month-${number}`>;

export type WindRoseSector = {
  dirDeg: number;
  speedBins: number[];
};

export type WindRoseStationMeta = {
  name: string;
  id: string;
  lat: number;
  lon: number;
  distanceKm?: number;
  heightM?: number;
  periodStart: string;
  periodEnd: string;
  source: string;
};

export type WindRose = {
  station: WindRoseStationMeta;
  season: WindRoseSeasonId;
  sectors: WindRoseSector[];
  calmPct: number;
  speedBinEdgesMs: number[];
  prevailingDirDeg: number;
  meanSpeedMs: number;
};

export type WindRoseSeasonRecord = {
  calmPct: number;
  prevailingDirDeg: number;
  meanSpeedMs: number;
  sectors: number[][];
  sectorMeanSpeedMs?: number[];
};

export type WindRoseStationRecord = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heightM?: number;
  periodStart: string;
  periodEnd: string;
  years?: number;
  sourceZip?: string;
  seasons: Record<WindRoseSeasonId, WindRoseSeasonRecord>;
};

export type WindRoseAsset = {
  version: number;
  speedBinEdgesMs: number[];
  source: string;
  stations: WindRoseStationRecord[];
};

export type WindStationSkip = {
  name: string;
  distanceKm: number;
  reason: string;
};

export type SiteWindStationMeta = WindRoseStationMeta & {
  years?: number;
  reason: string;
  skippedCloser: WindStationSkip[];
};

export type SiteWindSelection = {
  station: SiteWindStationMeta;
  asset: WindRoseAsset;
};