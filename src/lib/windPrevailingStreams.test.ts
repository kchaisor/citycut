import { describe, expect, it } from "vitest";
import type { WindPeriodStats } from "./windRose";
import { siteWindFromPublishedAsset } from "./windAssetDisk";
import { analyzeSiteWind } from "./windRoseStats";
import {
  PREVAILING_STREAM_MAX_ARROWS,
  PREVAILING_STREAM_MIN_SHARE,
  PREVAILING_STREAM_TOKENS,
  prevailingStreamLegend,
  prevailingStreams,
  sectorMeanSpeedMs,
} from "./windPrevailingStreams";

const EDGES = [0.5, 2, 4, 6, 8, 100];

function statsFrom(sectors: Record<number, number[]>): WindPeriodStats {
  const bins = Array.from({ length: 16 }, (_, sector) => sectors[sector] ?? [0, 0, 0, 0, 0]);
  const totals = bins.map((row) => row.reduce((a, b) => a + b, 0));
  const windy = totals.reduce((a, b) => a + b, 0);
  return {
    period: "annual",
    totalHours: 1,
    calmHours: 0,
    calmPercent: 0,
    sectorFrequency: totals.map((total) => total / windy),
    prevailingSector: totals.indexOf(Math.max(...totals)),
    prevailingLabel: "N",
    prevailingMedianKmh: 12,
    sectorSpeedBins: bins,
    speedBinEdgesMs: EDGES,
  };
}

const northNorthEastSouth = statsFrom({
  0: [0, 0.12, 0.24, 0, 0],
  1: [0.04, 0.16, 0.04, 0, 0],
  8: [0.06, 0.1, 0, 0, 0],
  4: [0.02, 0.04, 0, 0, 0],
  12: [0, 0.03, 0.03, 0, 0],
  14: [0.06, 0.06, 0, 0, 0],
});

describe("prevailing wind streams", () => {
  it("takes the three most frequent sectors with their labels, mean speeds and legend lines", () => {
    const streams = prevailingStreams(northNorthEastSouth);
    expect(streams.map((s) => s.label)).toEqual(["N", "NNE", "S"]);
    expect(streams.map((s) => s.sector)).toEqual([0, 1, 8]);
    expect(streams.map((s) => s.fromDeg)).toEqual([0, 22.5, 180]);
    expect(streams.map((s) => s.legend)).toEqual(["From N · 4.3 m/s", "From NNE · 3.0 m/s", "From S · 2.3 m/s"]);
    expect(streams[0]!.share).toBeCloseTo(0.36, 5);
    expect(streams.map((s) => s.token)).toEqual([...PREVAILING_STREAM_TOKENS]);
    expect(prevailingStreamLegend("N", 3.6)).toBe("From N · 3.6 m/s");
  });

  it("gives the strongest stream five arrows and the longest reach, and the weakest three", () => {
    const streams = prevailingStreams(northNorthEastSouth);
    expect(streams.map((s) => s.arrows)).toEqual([5, 4, 3]);
    expect(streams[0]!.reach).toBe(1);
    expect(streams[1]!.reach).toBeLessThan(1);
    expect(streams[2]!.reach).toBeLessThan(streams[1]!.reach);
    expect(streams.reduce((sum, s) => sum + s.arrows, 0)).toBeLessThanOrEqual(PREVAILING_STREAM_MAX_ARROWS);
  });

  it("breaks a frequency tie with the faster sector", () => {
    const tied = statsFrom({ 4: [0, 0.2, 0, 0, 0], 12: [0, 0, 0.2, 0, 0], 0: [0, 0.1, 0, 0, 0] });
    expect(prevailingStreams(tied).map((s) => s.label)).toEqual(["W", "E", "N"]);
  });

  it("drops a quieter third sector", () => {
    const quietThird = statsFrom({
      0: [0, 0.3, 0.3, 0, 0],
      8: [0, 0.3, 0, 0, 0],
      4: [0, 0.04, 0, 0, 0],
      5: [0, 0.03, 0, 0, 0],
      6: [0, 0.03, 0, 0, 0],
    });
    expect(quietThird.sectorFrequency[4]).toBeLessThan(PREVAILING_STREAM_MIN_SHARE);
    expect(prevailingStreams(quietThird).map((s) => s.label)).toEqual(["N", "S"]);
    const farBehind = statsFrom({ 0: [0, 0.9, 0, 0, 0], 8: [0, 0.07, 0, 0, 0], 4: [0, 0.03, 0, 0, 0] });
    expect(prevailingStreams(farBehind).map((s) => s.label)).toEqual(["N"]);
  });

  it("draws one fan from the design wind direction at that wind's own speed", () => {
    const streams = prevailingStreams(northNorthEastSouth, { sector: 12, stationMs: 7.2 });
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ label: "W", arrows: 5, reach: 1, legend: "From W · 7.2 m/s", token: "--wind-stream-1" });
  });

  it("returns nothing without wind data", () => {
    expect(prevailingStreams(null)).toEqual([]);
  });

  it("does not let the open-ended fastest bin inflate a sector's mean speed", () => {
    expect(sectorMeanSpeedMs([0, 0, 0, 0, 1], EDGES)).toBe(9);
    expect(sectorMeanSpeedMs([1, 0, 0, 0, 0], EDGES)).toBe(1.25);
    expect(sectorMeanSpeedMs([0, 0, 0, 0, 0], EDGES)).toBe(0);
  });

  it("reads believable streams from the real station table for every season option", () => {
    const southbank = siteWindFromPublishedAsset(-37.8216, 144.9645)!;
    for (const period of ["annual", "summer", "autumn", "winter", "spring"] as const) {
      const streams = prevailingStreams(analyzeSiteWind(southbank, period));
      expect(streams.length, period).toBeGreaterThanOrEqual(1);
      expect(streams.length, period).toBeLessThanOrEqual(3);
      for (const stream of streams) {
        expect(stream.meanSpeedMs, `${period} ${stream.label}`).toBeGreaterThan(0.5);
        expect(stream.meanSpeedMs, `${period} ${stream.label}`).toBeLessThan(13);
        expect(stream.legend).toMatch(/^From [NESW]{1,3} · \d+\.\d m\/s$/);
      }
    }
    expect(prevailingStreams(analyzeSiteWind(southbank, "month-1"))).toEqual([]);
  });
});
