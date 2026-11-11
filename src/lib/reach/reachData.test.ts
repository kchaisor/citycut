import { describe, expect, it } from "vitest";
import { REACH_BUDGET_DEFAULT } from "./constants";
import { computeReachTimes, reachAreaStats } from "./computeReach";
import path from "node:path";
import { defaultOriginCell } from "./loadReachDataset";
import { loadReachDatasetFromDir } from "./loadReachDatasetFs";

const FLINDERS = { lat: -37.8183, lon: 144.967 };

describe("reach dataset quality", () => {
  it("includes full PTV stop inventory and realistic Flinders St transit multiplier", async () => {
    const dataset = await loadReachDatasetFromDir(path.join(process.cwd(), "public/reach"));
    expect(dataset.manifest.stationCount).toBeGreaterThan(1000);
    expect(dataset.stations.length).toBeGreaterThan(1000);
    const origin = defaultOriginCell(dataset, FLINDERS.lat, FLINDERS.lon);
    const times = computeReachTimes(dataset, origin, "weekday_am", REACH_BUDGET_DEFAULT);
    const stats = reachAreaStats(dataset, times, REACH_BUDGET_DEFAULT);
    expect(stats.walkKm2).toBeGreaterThan(0.5);
    expect(stats.transitKm2).toBeGreaterThan(stats.walkKm2);
    expect(stats.transitMultiplier).toBeGreaterThan(1.5);
  }, 120_000);
});
