import type { WindPeriodId } from "./windRose";

export const WIND_ROSE_ASSET_VERSION = 1;
export const CALM_SPEED_MS = 0.5;
export const WIND_SPEED_BIN_EDGES_MS = [0.5, 10 / 3.6, 20 / 3.6, 30 / 3.6, 40 / 3.6, 100] as const;
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
};

export type WindRoseStationRecord = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heightM?: number;
  periodStart: string;
  periodEnd: string;
  seasons: Record<WindRoseSeasonId, WindRoseSeasonRecord>;
};

export type WindRoseAsset = {
  version: number;
  speedBinEdgesMs: number[];
  source: string;
  stations: WindRoseStationRecord[];
};

export type SiteWindSelection = {
  station: WindRoseStationMeta;
  asset: WindRoseAsset;
};