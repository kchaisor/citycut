import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dataDrivenDesignSectors,
  designWindPeriodStats,
  designWindsFor,
  designWindWindow,
  DESIGN_WIND_MIN_SEPARATION_DEG,
  findDesignWind,
  isDesignWindId,
} from "./windDesignWinds";
import { PEDESTRIAN_HEIGHT_FACTOR } from "./windPlanField";
import type { SiteWindSelection, WindRoseAsset, WindRoseSeasonRecord } from "./windRoseData";
import { analyzeSiteWind } from "./windRoseStats";
import { siteWindSelection } from "./windStation";

const PYRMONT = { lat: -33.86627, lon: 151.18389 };
const MONT_ALBERT_NORTH = { lat: -37.80458, lon: 145.1065 };

function readAsset(): WindRoseAsset {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public/wind/australia-tmyx.json"), "utf8")) as WindRoseAsset;
}

function recordOf(freqs: Record<number, number>, means: Record<number, number>): WindRoseSeasonRecord {
  const sectors = Array.from({ length: 16 }, (_, s) => [freqs[s] ?? 0, 0, 0, 0, 0]);
  const sectorMeanSpeedMs = Array.from({ length: 16 }, (_, s) => means[s] ?? 0);
  const windy = Object.values(freqs).reduce((a, b) => a + b, 0);
  return { calmPct: (1 - windy) * 100, prevailingDirDeg: 0, meanSpeedMs: 3, sectors, sectorMeanSpeedMs };
}

function gapDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("designWindWindow", () => {
  it("takes the frequency-weighted mean speed and share of the heading's sector and its two neighbours", () => {
    const record = recordOf({ 1: 0.1, 2: 0.2, 3: 0.1, 8: 0.5 }, { 1: 4, 2: 6, 3: 8, 8: 10 });
    const window = designWindWindow(record, 2);
    expect(window.stationMs).toBeCloseTo((0.1 * 4 + 0.2 * 6 + 0.1 * 8) / 0.4, 9);
    expect(window.share).toBeCloseTo(0.4, 9);
    expect(window.energy).toBeCloseTo(0.1 * 64 + 0.2 * 216 + 0.1 * 512, 9);
  });

  it("wraps around north", () => {
    const record = recordOf({ 15: 0.1, 0: 0.1, 1: 0.2 }, { 15: 3, 0: 3, 1: 6 });
    expect(designWindWindow(record, 0).share).toBeCloseTo(0.4, 9);
    expect(designWindWindow(record, 0).stationMs).toBeCloseTo((0.3 + 0.3 + 1.2) / 0.4, 9);
  });
});

describe("dataDrivenDesignSectors", () => {
  it("picks the three most energetic compass directions at least 67.5 degrees apart", () => {
    const record = recordOf({ 0: 0.2, 2: 0.2, 8: 0.1, 12: 0.1, 4: 0.01 }, { 0: 6, 2: 5.5, 8: 7, 12: 6.5, 4: 2 });
    const sectors = dataDrivenDesignSectors(record);
    expect(sectors).toHaveLength(3);
    for (let i = 0; i < sectors.length; i++) {
      for (let j = i + 1; j < sectors.length; j++) {
        expect(gapDeg(sectors[i]! * 22.5, sectors[j]! * 22.5)).toBeGreaterThanOrEqual(DESIGN_WIND_MIN_SEPARATION_DEG);
      }
    }
    expect(sectors.every((s) => s % 2 === 0)).toBe(true);
  });
});

describe("designWindsFor with the bundled TMYx asset", () => {
  const asset = readAsset();

  it("gives Pyrmont (Sydney Airport) the consultants' NE, S and W at 45, 180 and 270 degrees", () => {
    const selection = siteWindSelection(asset, PYRMONT.lat, PYRMONT.lon)!;
    expect(selection.station.id).toBe("947670");
    const winds = designWindsFor(selection);
    expect(winds.map((w) => w.label)).toEqual(["NE", "S", "W"]);
    expect(winds.map((w) => w.id)).toEqual(["design-ne", "design-s", "design-w"]);
    expect(winds.map((w) => w.headingDeg)).toEqual([45, 180, 270]);
    for (const wind of winds) {
      expect(wind.stationMs).toBeGreaterThan(3);
      expect(wind.stationMs).toBeLessThan(10);
      expect(wind.referenceMs).toBeCloseTo(wind.stationMs * PEDESTRIAN_HEIGHT_FACTOR, 9);
      expect(wind.sharePct).toBeGreaterThan(5);
      expect(wind.sharePct).toBeLessThan(50);
    }
  });

  it("gives Mont Albert North (Viewbank) three data-driven headings at least 67.5 degrees apart", () => {
    const selection = siteWindSelection(asset, MONT_ALBERT_NORTH.lat, MONT_ALBERT_NORTH.lon)!;
    expect(selection.station.name).toMatch(/Viewbank/i);
    const winds = designWindsFor(selection);
    expect(winds).toHaveLength(3);
    for (let i = 0; i < winds.length; i++) {
      expect(winds[i]!.id).toBe(`design-${winds[i]!.label.toLowerCase()}`);
      for (let j = i + 1; j < winds.length; j++) {
        expect(gapDeg(winds[i]!.headingDeg, winds[j]!.headingDeg)).toBeGreaterThanOrEqual(67.5);
      }
    }
  });

  it("points the 3D ground wind along the design heading at the design speed", () => {
    const selection = siteWindSelection(asset, PYRMONT.lat, PYRMONT.lon) as SiteWindSelection;
    const south = findDesignWind(designWindsFor(selection), "design-s")!;
    const stats = designWindPeriodStats(analyzeSiteWind(selection, "annual")!, south);
    expect(stats.prevailingSector).toBe(8);
    expect(stats.prevailingMeanSpeedMs).toBeCloseTo(south.stationMs, 9);
  });
});

describe("isDesignWindId", () => {
  it("accepts design ids and rejects seasons", () => {
    expect(isDesignWindId("design-ne")).toBe(true);
    expect(isDesignWindId("design-wsw")).toBe(true);
    expect(isDesignWindId("annual")).toBe(false);
    expect(isDesignWindId(null)).toBe(false);
  });
});
