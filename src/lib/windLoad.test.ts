import { describe, expect, it, beforeEach } from "vitest";
import { loadSiteWind, loadWindRoseAsset, resetWindRoseAssetCache } from "./windLoad";
import type { WindRoseAsset } from "./windRoseData";

const fixture: WindRoseAsset = {
  version: 1,
  speedBinEdgesMs: [0.5, 2.78, 5.56, 8.33, 11.11, 100],
  source: "climate.onebuilding.org TMYx EPW",
  stations: [
    {
      id: "948700",
      name: "Melbourne-Moorabbin.AP",
      lat: -37.98,
      lon: 145.096,
      periodStart: "2009",
      periodEnd: "2023",
      seasons: {
        annual: { calmPct: 4, prevailingDirDeg: 330, meanSpeedMs: 3.2, sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]) },
        summer: { calmPct: 4, prevailingDirDeg: 330, meanSpeedMs: 3.2, sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]) },
        autumn: { calmPct: 4, prevailingDirDeg: 330, meanSpeedMs: 3.2, sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]) },
        winter: { calmPct: 4, prevailingDirDeg: 180, meanSpeedMs: 3.2, sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]) },
        spring: { calmPct: 4, prevailingDirDeg: 330, meanSpeedMs: 3.2, sectors: Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]) },
      },
    },
  ],
};

beforeEach(() => {
  resetWindRoseAssetCache();
});

describe("windLoad", () => {
  it("loads the static asset and annotates nearest-station distance", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });

    const result = await loadSiteWind(-37.983826, 145.21555, fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.station.name).toContain("Moorabbin");
    expect(result.selection.station.distanceKm).toBeGreaterThan(0);
    expect(result.selection.station.periodStart).toBe("2009");
  });

  it("loads a version 2 asset with record length and source file", async () => {
    const station = fixture.stations[0]!;
    const v2: WindRoseAsset = {
      ...fixture,
      version: 2,
      stations: [{ ...station, years: 19, sourceZip: "AUS_VIC_Melbourne-Moorabbin.AP.948700_TMYx.zip" }],
    };
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify(v2), { status: 200 });
    const asset = await loadWindRoseAsset(fetchImpl);
    expect(asset?.version).toBe(2);
    expect(asset?.stations[0]?.years).toBe(19);
    expect(asset?.stations[0]?.sourceZip).toContain("_TMYx.zip");
  });

  it("rejects an unknown asset version", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ ...fixture, version: 99 }), { status: 200 });
    expect(await loadWindRoseAsset(fetchImpl)).toBeNull();
  });
});
