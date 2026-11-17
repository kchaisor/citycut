import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";
import type { WindRoseAsset } from "./windRoseData";
import { WIND_ROSE_ASSET_VERSION } from "./windRoseData";
import { isWindStationSane, nearestWindStation } from "./windStation";

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

  it("includes Sydney Airport with a long record", () => {
    const asset = readAsset();
    if (!asset) return;
    const airport = stationById(asset, "947670");
    expect(airport).toBeDefined();
    expect(airport!.years).toBeGreaterThanOrEqual(50);
    expect(isWindStationSane(airport!)).toBe(true);
  });

  it("keeps Viewbank sane and nearest for Mont Albert North", () => {
    const asset = readAsset();
    if (!asset) return;
    const viewbank = stationById(asset, "958740");
    expect(viewbank).toBeDefined();
    expect(isWindStationSane(viewbank!)).toBe(true);
    expect(nearestWindStation(asset, -37.80458, 145.1065)?.station.id).toBe("958740");
  });

  it("uses Sydney Observatory Hill's full record, which passes the calm caps and is nearest for Pyrmont", () => {
    const asset = readAsset();
    if (!asset) return;
    const obsHill = stationById(asset, "947680");
    expect(obsHill).toBeDefined();
    expect(obsHill!.years).toBeGreaterThanOrEqual(50);
    expect(isWindStationSane(obsHill!)).toBe(true);
    expect(nearestWindStation(asset, -33.86627, 151.18389)?.station.id).toBe("947680");
  });
});
