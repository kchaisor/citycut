import { describe, expect, it } from "vitest";
import type { WindRoseAsset } from "./windRoseData";
import { haversineKm, isWindStationSane, nearestWindStation } from "./windStation";

const seasonStub = { calmPct: 5, prevailingDirDeg: 0, meanSpeedMs: 3, sectors: [] as number[][] };

const asset: WindRoseAsset = {
  version: 1,
  speedBinEdgesMs: [2 / 3.6, 10 / 3.6, 20 / 3.6, 30 / 3.6, 40 / 3.6, 100],
  source: "test",
  stations: [
    {
      id: "948680",
      name: "Melbourne-Regional.Office",
      lat: -37.813,
      lon: 144.963,
      periodStart: "2009",
      periodEnd: "2015",
      seasons: {
        annual: { ...seasonStub, calmPct: 50 },
        summer: seasonStub,
        autumn: seasonStub,
        winter: { ...seasonStub, calmPct: 72 },
        spring: seasonStub,
      },
    },
    {
      id: "959360",
      name: "Olympic.Park",
      lat: -37.825,
      lon: 144.98,
      periodStart: "2009",
      periodEnd: "2023",
      seasons: {
        annual: { ...seasonStub, calmPct: 6 },
        summer: seasonStub,
        autumn: seasonStub,
        winter: { ...seasonStub, calmPct: 7.1 },
        spring: seasonStub,
      },
    },
    {
      id: "948700",
      name: "Melbourne-Moorabbin.AP",
      lat: -37.98,
      lon: 145.096,
      periodStart: "2009",
      periodEnd: "2023",
      seasons: {
        annual: seasonStub,
        summer: seasonStub,
        autumn: seasonStub,
        winter: { ...seasonStub, calmPct: 5.1 },
        spring: seasonStub,
      },
    },
  ],
};

describe("windStation", () => {
  it("skips implausible high-calm stations within search radius", () => {
    const cbd = nearestWindStation(asset, -37.8136, 144.9631);
    expect(cbd?.station.id).toBe("959360");
    expect(cbd!.distanceKm).toBeLessThan(5);
    expect(isWindStationSane(asset.stations[0]!)).toBe(false);
  });

  it("picks the nearest TMYx station by great-circle distance when all are sane", () => {
    const dandenong = nearestWindStation(asset, -37.983826, 145.21555);
    expect(dandenong?.station.id).toBe("948700");
    expect(dandenong!.distanceKm).toBeGreaterThan(5);
    expect(dandenong!.distanceKm).toBeLessThan(25);
  });

  it("computes haversine distance", () => {
    expect(haversineKm(-37.98, 145.096, -37.983826, 145.21555)).toBeGreaterThan(10);
  });
});