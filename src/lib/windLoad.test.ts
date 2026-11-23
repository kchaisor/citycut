import { describe, expect, it, beforeEach } from "vitest";
import { loadSiteWind, loadWindRoseAsset, resetWindRoseAssetCache } from "./windLoad";
import type { WindRoseAsset, WindRoseIndex } from "./windRoseData";

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

  it("loads only the chosen station file from a version 3 index", async () => {
    const station = fixture.stations[0]!;
    const index: WindRoseIndex = {
      version: 3,
      speedBinEdgesMs: fixture.speedBinEdgesMs,
      source: fixture.source,
      stations: [
        {
          id: station.id,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          periodStart: station.periodStart,
          periodEnd: station.periodEnd,
          annualCalmPct: 4,
          winterCalmPct: 4,
        },
        {
          id: "999999",
          name: "Other.Station",
          lat: -33.8,
          lon: 151.2,
          periodStart: "2011",
          periodEnd: "2025",
          annualCalmPct: 2,
          winterCalmPct: 2,
        },
      ],
    };
    const requested: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("australia-tmyx.json")) {
        return new Response(JSON.stringify(index), { status: 200 });
      }
      if (url.endsWith("stations/948700.json")) {
        return new Response(JSON.stringify({ ...station, seasons: { ...station.seasons, annual: { ...station.seasons.annual, morning: station.seasons.annual, afternoon: station.seasons.annual } } }), { status: 200 });
      }
      return new Response("missing", { status: 404 });
    };
    const result = await loadSiteWind(-37.983826, 145.21555, fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.station.id).toBe("948700");
    expect(result.selection.asset.stations).toHaveLength(1);
    expect(result.selection.asset.stations[0]?.seasons.annual.morning).toBeDefined();
    expect(requested.some((url) => url.endsWith("stations/948700.json"))).toBe(true);
    expect(requested.some((url) => url.endsWith("stations/999999.json"))).toBe(false);
  });
});
