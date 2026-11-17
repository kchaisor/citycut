import { describe, expect, it } from "vitest";
import type { WindRoseAsset } from "./windRoseData";
import { haversineKm, isWindStationSane, nearestWindStation, referenceStationRule, siteWindSelection } from "./windStation";
import { formatSkippedCloserLine, formatStationLine1, plainWindCaption, windRoseStationCaption } from "./windRoseCaptions";

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

  it("names the calm station a site skipped, with its winter calm", () => {
    const cbd = siteWindSelection(asset, -37.8136, 144.9631)!;
    expect(cbd.station.reason).toBe("nearest");
    expect(cbd.station.skippedCloser).toEqual([
      { name: "Melbourne Regional Office", distanceKm: expect.any(Number), reason: "wind record mostly calm, 72% calm in winter" },
    ]);
  });

  it("names each reason once for a run of skipped stations", () => {
    const pick = siteWindSelection(asset, -37.8136, 144.9631)!;
    pick.station.skippedCloser = [
      { name: "A", distanceKm: 1, reason: "wind record mostly calm, 90% calm in winter" },
      { name: "B", distanceKm: 2, reason: "harbour site: Sydney Airport preferred" },
      { name: "C", distanceKm: 3, reason: "harbour site: Sydney Airport preferred" },
    ];
    expect(formatSkippedCloserLine(pick)).toBe(
      "Closer: A 1.0\u00a0km (wind record mostly calm, 90% calm in winter) · B 2.0\u00a0km · C 3.0\u00a0km (harbour site: Sydney Airport preferred)",
    );
  });

  it("shows the years covered in the station line", () => {
    const pick = siteWindSelection({ ...asset, stations: [{ ...asset.stations[2]!, years: 15 }] }, -37.98, 145.1)!;
    expect(plainWindCaption(formatStationLine1(pick))).toContain("2009–2023 (15 yrs)");
  });

  it("keeps the export caption to plain spaces", () => {
    const pick = siteWindSelection({ ...asset, stations: [{ ...asset.stations[2]!, years: 15 }] }, -37.98, 145.1)!;
    const caption = windRoseStationCaption(pick, "annual");
    expect(caption).toContain("2009–2023 (15 yrs)");
    expect(caption).not.toMatch(/[\u00a0\u2060]/);
  });

  it.each([
    ["Pyrmont", -33.86627, 151.18389],
    ["Sydney CBD", -33.8688, 151.2093],
    ["North Sydney", -33.839, 151.207],
    ["Balmain", -33.859, 151.179],
    ["Rozelle", -33.862, 151.17],
    ["Mosman", -33.829, 151.244],
  ])("treats %s as a harbour site", (_name, lat, lon) => {
    expect(referenceStationRule(lat, lon)?.stationId).toBe("947670");
  });

  it.each([
    ["Parramatta", -33.815, 151.003],
    ["Penrith", -33.751, 150.694],
    ["Hornsby", -33.703, 151.099],
    ["Mont Albert North", -37.80458, 145.1065],
  ])("does not treat %s as a harbour site", (_name, lat, lon) => {
    expect(referenceStationRule(lat, lon)).toBeNull();
  });
});
