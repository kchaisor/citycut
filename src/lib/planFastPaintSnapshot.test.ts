import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { buildFastPlanPaths, planPathsFromSiteStyle } from "./planPathsSession";
import { clearAllRoadFillCachesForTests } from "./roadFill";
import { planRoadPathFillDs } from "./svgPlan";

/** Captured from origin/main @ 8fb47f6 via node scripts/capture-main-fast-snapshot.mjs (main planPaths + svgRings only). */
const SNAPSHOT_PATH = new URL("./fixtures/east-melbourne-fast-plan-d.snapshot.txt", import.meta.url);

describe("fast plan paint matches main DOM strings", () => {
  it("East Melbourne road/path d strings match main snapshot at 8fb47f6", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    clearAllRoadFillCachesForTests();
    const request = planPathsFromSiteStyle(model, 500, DEFAULT_LINE_STYLES);
    const progressiveFast = buildFastPlanPaths({
      ...request,
      planOptions: {
        ...request.planOptions,
        quality: "fast",
        smoothOutput: false,
        centrelineSmooth: false,
      },
    });
    const fromProgressive = planRoadPathFillDs(progressiveFast);
    const expected = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(fromProgressive).toBe(expected);
  });
});
