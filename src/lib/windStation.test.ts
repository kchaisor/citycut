import { describe, expect, it } from "vitest";
import type { WindRoseAsset } from "./windRoseData";
import { haversineKm, nearestWindStation } from "./windStation";

const asset: WindRoseAsset = {
  version: 1,
  speedBinEdgesMs: [0.5, 2.78, 5.56, 8.33, 11.11, 100],
  source: "test",
  stations: [
    {
      id: "melbourne",
      name: "Melbourne CBD",
      lat: -37.813,
      lon: 144.963,
      periodStart: "2009",
      periodEnd: "2023",
      seasons: {
        annual: { calmPct: 5, prevailingDirDeg: 0, meanSpeedMs: 3, sectors: [] },
        summer: { calmPct: 5, prevailingDirDeg: 0, meanSpeedMs: 3, sectors: [] },
        autumn: { calmPct: 5, prevailingDirDeg: 0, meanSpeedMs: 3, sectors: [] },
        winter: { calmPct: 5, prevailingDirDeg: 180, meanSpeedMs: 3, sectors: [] },
        spring: { calmPct: 5, prevailingDirDeg: 0, meanSpeedMs: 3, sectors: [] },
      },
    },
    {
      id: "moorabbin",
      name: "Melbourne-Moorabbin.AP",
      lat: -37.98,
      lon: 145.096,
      periodStart: "2009",
      periodEnd: "2023",
      seasons: {
        annual: { calmPct: 5, prevailingDirDeg: 90, meanSpeedMs: 3, sectors: [] },
        summer: { calmPct: 5, prevailingDirDeg: 90, meanSpeedMs: 3, sectors: [] },
        autumn: { calmPct: 5, prevailingDirDeg: 90, meanSpeedMs: 3, sectors: [] },
        winter: { calmPct: 5, prevailingDirDeg: 270, meanSpeedMs: 3, sectors: [] },
        spring: { calmPct: 5, prevailingDirDeg: 90, meanSpeedMs: 3, sectors: [] },
      },
    },
  ],
};

describe("windStation", () => {
  it("picks the nearest TMYx station by great-circle distance", () => {
    const melbourne = nearestWindStation(asset, -37.8136, 144.9631);
    expect(melbourne?.station.id).toBe("melbourne");
    expect(melbourne!.distanceKm).toBeLessThan(1);

    const dandenong = nearestWindStation(asset, -37.983826, 145.21555);
    expect(dandenong?.station.id).toBe("moorabbin");
    expect(dandenong!.distanceKm).toBeGreaterThan(5);
    expect(dandenong!.distanceKm).toBeLessThan(25);
  });

  it("computes haversine distance", () => {
    expect(haversineKm(-37.98, 145.096, -37.983826, 145.21555)).toBeGreaterThan(10);
  });
});