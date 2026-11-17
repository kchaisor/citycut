import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";
import type { WindRoseAsset } from "./windRoseData";
import { WIND_ROSE_ASSET_VERSION } from "./windRoseData";
import { isWindStationSane, nearestWindStation, siteWindSelection } from "./windStation";
import { formatSkippedCloserLine, formatStationLine1, plainWindCaption } from "./windRoseCaptions";

const assetPath = path.join(process.cwd(), "public/wind/australia-tmyx.json");

function readAsset(): WindRoseAsset | null {
  try {
    return JSON.parse(readFileSync(assetPath, "utf8")) as WindRoseAsset;
  } catch {
    return null;
  }
}

function stationById(asset: WindRoseAsset, id: string) {
  return asset.stations.find((s) => s.id === id);
}

describe("australia TMYx wind asset", () => {
  it("uses Melbourne Regional Office's full 1954-2015 record for Melbourne CBD now its calm is plausible", () => {
    const asset = readAsset();
    if (!asset) return;
    const pick = nearestWindStation(asset, -37.8136, 144.9631);
    expect(pick?.station.id).toBe("948680");
    expect(pick?.station.periodStart).toBe("1954");
    const winterCalm = pick?.station.seasons.winter.calmPct;
    expect(winterCalm).toBeDefined();
    expect(winterCalm!).toBeLessThan(30);
    expect(winterCalm!).toBeGreaterThan(0);
  });

  it("records the length, source file and sector speeds of every station", () => {
    const asset = readAsset();
    if (!asset) return;
    expect(asset.version).toBe(WIND_ROSE_ASSET_VERSION);
    for (const station of asset.stations) {
      expect(station.sourceZip).toMatch(/_TMYx(\.\d{4}-\d{4})?\.zip$/);
      expect(station.seasons.annual.sectorMeanSpeedMs).toHaveLength(16);
      expect(station.seasons.winter.sectorMeanSpeedMs).toHaveLength(16);
    }
  });

  it("uses Riverview's full 1997-2015 record, not the 7-year 2009-2023 file", () => {
    const asset = readAsset();
    if (!asset) return;
    const riverview = stationById(asset, "957640");
    expect(riverview?.years).toBeGreaterThanOrEqual(19);
    expect(riverview?.periodStart).toBe("1997");
  });

  it("skips Sydney Airport's gappy 1940-2025 record for its 2011-2025 file", () => {
    const asset = readAsset();
    if (!asset) return;
    const airport = stationById(asset, "947670");
    expect(airport).toBeDefined();
    expect(airport!.sourceZip).toMatch(/_TMYx\.2011-2025\.zip$/);
    expect(airport!.years).toBe(15);
    expect(isWindStationSane(airport!)).toBe(true);
    for (const season of ["annual", "summer", "autumn", "winter", "spring"] as const) {
      expect(airport!.seasons[season].calmPct).toBeLessThan(5);
    }
  });

  it("keeps Viewbank sane and nearest for Mont Albert North", () => {
    const asset = readAsset();
    if (!asset) return;
    const viewbank = stationById(asset, "958740");
    expect(viewbank).toBeDefined();
    expect(isWindStationSane(viewbank!)).toBe(true);
    expect(nearestWindStation(asset, -37.80458, 145.1065)?.station.id).toBe("958740");
  });

  it("uses Sydney Observatory Hill's full record, which passes the calm caps", () => {
    const asset = readAsset();
    if (!asset) return;
    const obsHill = stationById(asset, "947680");
    expect(obsHill).toBeDefined();
    expect(obsHill!.years).toBeGreaterThanOrEqual(50);
    expect(isWindStationSane(obsHill!)).toBe(true);
  });

  it("gives Pyrmont Sydney Airport and explains the closer stations it skipped", () => {
    const asset = readAsset();
    if (!asset) return;
    const pick = siteWindSelection(asset, -33.86627, 151.18389)!;
    expect(pick.station.id).toBe("947670");
    expect(pick.station.name).toBe("Sydney Airport");
    expect(pick.station.distanceKm).toBeCloseTo(9, 0);
    expect(pick.station.years).toBe(15);
    expect(pick.station.reason).toMatch(/^Harbour site/);
    expect(pick.station.skippedCloser.length).toBeLessThanOrEqual(3);
    const byName = Object.fromEntries(pick.station.skippedCloser.map((s) => [s.name, s]));
    expect(byName["Sydney Observatory Hill"]?.reason).toBe("harbour site: Sydney Airport preferred");
    expect(byName["Sydney Observatory Hill"]?.distanceKm).toBeCloseTo(2, 0);
    expect(byName["Riverview Observatory"]?.reason).toBe("harbour site: Sydney Airport preferred");
    expect(pick.station.skippedCloser[0]?.name).toBe("Sydney Observatory Hill");
    expect(plainWindCaption(formatStationLine1(pick))).toBe("Sydney Airport · 9.0 km · 2011–2025 (15 yrs)");
    expect(formatSkippedCloserLine(pick)).toBe(
      "Closer: Sydney Observatory Hill 2.0 km · Riverview Observatory 4.8 km · Canterbury Park Racecourse 7.9 km (harbour site: Sydney Airport preferred)",
    );
  });

  it("keeps Mont Albert North on Viewbank as the nearest station", () => {
    const asset = readAsset();
    if (!asset) return;
    const pick = siteWindSelection(asset, -37.80458, 145.1065)!;
    expect(pick.station.id).toBe("958740");
    expect(pick.station.name).toBe("Viewbank");
    expect(pick.station.reason).toBe("nearest");
  });

  it("keeps Parramatta, outside the harbour circle, on the nearest sane station", () => {
    const asset = readAsset();
    if (!asset) return;
    const pick = siteWindSelection(asset, -33.815, 151.003)!;
    expect(pick.station.id).not.toBe("947670");
    expect(pick.station.reason).toBe("nearest");
    expect(pick.station.skippedCloser.every((s) => s.reason.startsWith("wind record mostly calm"))).toBe(true);
  });
});
