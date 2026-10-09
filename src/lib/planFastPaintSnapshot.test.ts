import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { PATH_WIDTH_M } from "./lineweights";
import { buildFastPlanPaths, planPathsFromSiteStyle } from "./planPathsSession";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { planPaths, planRoadPathFillDs } from "./svgPlan";

const SNAPSHOT_PATH = new URL("./fixtures/east-melbourne-fast-plan-d.snapshot.txt", import.meta.url);

/** Main-branch first-paint plan: single-quality planPaths + legacy SVG rounding. */
function mainStyleFastPlanDs(model: CityModel): string {
  clearFootpathUnionCacheForTests();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: DEFAULT_LINE_STYLES.pathFilletM,
    quality: "fast",
    smoothOutput: false,
    centrelineSmooth: false,
  });
  return planRoadPathFillDs(plan);
}

describe("fast plan paint matches main DOM strings", () => {
  it("East Melbourne road/path d strings match committed main snapshot", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    clearFootpathUnionCacheForTests();
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
    const mainStyle = mainStyleFastPlanDs(model);
    expect(fromProgressive).toBe(mainStyle);
    const expected = readFileSync(SNAPSHOT_PATH, "utf8");
    expect(fromProgressive).toBe(expected);
  });
});
