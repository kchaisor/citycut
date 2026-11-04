import type { ReachPeriod } from "./constants";

export type ReachManifest = {
  version: number;
  h3Resolution: number;
  walkSpeedKmh: number;
  waitPolicy: string;
  exampleData: boolean;
  sources: {
    walking: { name: string; url: string; retrieved: string };
    transit: { name: string; url: string; retrieved: string };
  };
  cellCount: number;
  stationCount: number;
  profiles: ReachPeriod[];
  files: Record<string, string>;
};

export type ReachStation = {
  name: string;
  cellIndex: number;
  modes: ("train" | "tram" | "bus")[];
};

export type ReachDataset = {
  manifest: ReachManifest;
  h3Indices: string[];
  lat: Float32Array;
  lng: Float32Array;
  neighbors: Uint16Array[];
  edgeMinutes: Float32Array[];
  stations: ReachStation[];
  ptMinutes: Record<ReachPeriod, Uint8Array>;
};

export type ReachOriginState = {
  cellIndex: number;
  h3Index: string;
  lat: number;
  lng: number;
  label: string;
};

export type ReachCellTimes = {
  walkMin: Uint8Array;
  combinedMin: Uint8Array;
};

export type ReachAreaStats = {
  walkKm2: number;
  walkHexes: number;
  walkRadiusKm: number;
  transitKm2: number;
  transitHexes: number;
  stationCount: number;
  tramLineCount: number;
  transitMultiplier: number;
  insightMinute: number;
  insightKm2PerMin: number;
};

export type ReachMinuteSeries = {
  minutes: number[];
  walkCumulativeKm2: number[];
  transitExtraKm2: number[];
};
