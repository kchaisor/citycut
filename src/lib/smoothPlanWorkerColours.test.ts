import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { CityModel } from "../types";
import * as colours from "./colours";
import { COLOUR_FALLBACK, runWithPlanColours } from "./colours";
import { sitePlanChunksForExport } from "./aiPlan";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { clearFootpathUnionCacheForTests } from "./roadFill";
import { computeSmoothPlanPaths, runSmoothPlanWorkerJob } from "./smoothPlanCompute";
import { ensureSmoothPlanPaths, planPathsFromSiteStyle, resetPlanPathsSessionForTests } from "./planPathsSession";
import { hexRgb } from "./lineweights";

const CUSTOM = "#FF00FF";

function residentialModel(): CityModel {
  const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
  const model = JSON.parse(raw) as CityModel;
  const building = model.buildings[0] ?? {
    id: 9001,
    ring: [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10],
    ],
    holes: [],
    height: 12,
    use: "residential" as const,
    source: "osm_tag" as const,
  };
  model.buildings = [{ ...building, use: "residential" }];
  return model;
}

function snapshotWithCustomResidential(): typeof COLOUR_FALLBACK {
  return { ...COLOUR_FALLBACK, "--use-residential": CUSTOM };
}

describe("smooth plan worker colours", () => {
  beforeEach(() => {
    clearFootpathUnionCacheForTests();
    resetPlanPathsSessionForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses colourSnapshot when document is unavailable (worker path)", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    const request = {
      ...planPathsFromSiteStyle(residentialModel(), 500, DEFAULT_LINE_STYLES),
      colourSnapshot: snapshotWithCustomResidential(),
    };
    clearFootpathUnionCacheForTests();
    const plan = runSmoothPlanWorkerJob(request);
    const fills = plan.buildings.map((b) => b.fill.toUpperCase());
    expect(fills.some((fill) => fill === CUSTOM)).toBe(true);
    expect(fills.every((fill) => fill !== COLOUR_FALLBACK["--use-residential"].toUpperCase())).toBe(true);
  });

  it("smooth build and export keep custom residential fill from colourSnapshot", async () => {
    const model = residentialModel();
    const request = {
      ...planPathsFromSiteStyle(model, 500, DEFAULT_LINE_STYLES),
      colourSnapshot: snapshotWithCustomResidential(),
    };
    vi.spyOn(colours, "snapshotPlanColours").mockReturnValue(snapshotWithCustomResidential());
    clearFootpathUnionCacheForTests();
    const plan = await ensureSmoothPlanPaths(request);
    expect(plan.buildings.some((b) => b.fill.toUpperCase() === CUSTOM)).toBe(true);
    const chunks = await sitePlanChunksForExport(model, 500, DEFAULT_LINE_STYLES);
    const buildings = chunks.find((c) => c.name === "Buildings");
    const rgb = hexRgb(CUSTOM);
    expect(
      buildings?.paths?.some(
        (path) => path.fill?.[0] === rgb[0] && path.fill?.[1] === rgb[1] && path.fill?.[2] === rgb[2],
      ),
    ).toBe(true);
  });

  it("runWithPlanColours applies overrides without document", () => {
    vi.stubGlobal("document", undefined);
    const plan = runWithPlanColours({ "--use-residential": CUSTOM }, () =>
      computeSmoothPlanPaths({
        ...planPathsFromSiteStyle(residentialModel(), 500, DEFAULT_LINE_STYLES),
        colourSnapshot: snapshotWithCustomResidential(),
      }),
    );
    expect(plan.buildings.some((b) => b.fill.toUpperCase() === CUSTOM)).toBe(true);
  });
});
