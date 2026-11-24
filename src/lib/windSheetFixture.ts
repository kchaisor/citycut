import type { SiteWindSelection, WindRoseSeasonRecord } from "./windRoseData";

function sectors(north: number, south: number): number[][] {
  return Array.from({ length: 16 }, (_, sector) => {
    if (sector === 0) return [north, north / 2, 0, 0, 0];
    if (sector === 8) return [south, south / 2, 0, 0, 0];
    return [0, 0, 0, 0, 0];
  });
}

function record(north: number, south: number, dir: number, mean: number): WindRoseSeasonRecord {
  const speeds = Array.from({ length: 16 }, (_, sector) => (sector === 0 ? 4 : sector === 8 ? 5 : 0));
  return {
    calmPct: 6.4,
    prevailingDirDeg: dir,
    meanSpeedMs: mean,
    sectors: sectors(north, south),
    sectorMeanSpeedMs: speeds,
    morning: { calmPct: 3.1, prevailingDirDeg: 0, meanSpeedMs: 4, sectors: sectors(0.27, 0.03), sectorMeanSpeedMs: speeds },
    afternoon: { calmPct: 2.2, prevailingDirDeg: 180, meanSpeedMs: 5, sectors: sectors(0.03, 0.27), sectorMeanSpeedMs: speeds },
  };
}

export const WIND_SHEET_SELECTION: SiteWindSelection = {
  asset: {
    version: 3,
    speedBinEdgesMs: [0.5, 2, 4, 6, 8, 100],
    source: "test",
    stations: [],
  },
  station: {
    id: "948680",
    name: "Sydney Airport",
    lat: -33.95,
    lon: 151.17,
    periodStart: "2011",
    periodEnd: "2025",
    source: "test",
    reason: "nearest",
    skippedCloser: [],
    distanceKm: 8.8,
  },
};

const seasons = {
  annual: record(0.18, 0.12, 0, 4.2),
  summer: record(0.1, 0.3, 180, 5.1),
  autumn: record(0.18, 0.12, 0, 3.9),
  winter: record(0.3, 0.05, 270, 4.8),
  spring: record(0.2, 0.2, 90, 4.4),
};

WIND_SHEET_SELECTION.asset.stations.push({
  id: "948680",
  name: "Sydney Airport",
  lat: -33.95,
  lon: 151.17,
  periodStart: "2011",
  periodEnd: "2025",
  seasons,
});
