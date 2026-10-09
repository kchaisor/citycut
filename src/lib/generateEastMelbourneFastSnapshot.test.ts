import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import type { CityModel } from "../types";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { clearFootpathUnionCacheForTests } from "./roadFill"; // main-only snapshot
import { buildFastPlanPaths, planPathsFromSiteStyle } from "./planPathsSession";
import { planRoadPathFillDs } from "./svgPlan";

const SNAPSHOT_PATH = new URL("./fixtures/east-melbourne-fast-plan-d.snapshot.txt", import.meta.url);

/** Run with GENERATE_FAST_SNAPSHOT=1 from origin/main worktree to refresh the fixture. */
describe("generate east melbourne fast plan d snapshot", () => {
  it("writes snapshot from current planPaths (main behaviour)", () => {
    if (process.env.GENERATE_FAST_SNAPSHOT !== "1") return;
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    clearFootpathUnionCacheForTests();
    const request = planPathsFromSiteStyle(model, 500, DEFAULT_LINE_STYLES);
    const plan = buildFastPlanPaths({
      ...request,
      planOptions: {
        ...request.planOptions,
        quality: "fast",
        smoothOutput: false,
        centrelineSmooth: false,
      },
    });
    writeFileSync(SNAPSHOT_PATH, planRoadPathFillDs(plan));
  });
});
