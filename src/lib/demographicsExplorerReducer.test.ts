import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activeDemographicsPins,
  clampDemographicsRadius,
  demographicsExplorerInvariant,
  initialDemographicsExplorerState,
  reduceDemographicsExplorer,
} from "./demographicsExplorerReducer";

describe("demographicsExplorerReducer TLA invariants", () => {
  it("matches spec module and compare pin count", () => {
    const spec = readFileSync("specs/demographicsExplorer.tla", "utf8");
    expect(spec).toContain("MODULE demographicsExplorer");
    expect(spec).toContain('panelMode = "compare" => ActiveCount = 2');
  });

  it("keeps invariants across radius and mode transitions", () => {
    let state = initialDemographicsExplorerState();
    expect(demographicsExplorerInvariant(state)).toBe(true);
    expect(activeDemographicsPins(state).length).toBe(2);

    state = reduceDemographicsExplorer(state, { type: "setPanelMode", panelMode: "single" });
    expect(demographicsExplorerInvariant(state)).toBe(true);

    state = reduceDemographicsExplorer(state, { type: "setPanelMode", panelMode: "compare" });
    expect(activeDemographicsPins(state).length).toBe(2);

    for (const radius of [199, 200, 400, 1200, 1201]) {
      expect(clampDemographicsRadius(radius)).toBeGreaterThanOrEqual(200);
      expect(clampDemographicsRadius(radius)).toBeLessThanOrEqual(1200);
      state = reduceDemographicsExplorer(state, { type: "setRadius", radiusM: radius });
      expect(demographicsExplorerInvariant(state)).toBe(true);
    }

    state = reduceDemographicsExplorer(state, { type: "movePin", pin: "b", lon: 144.98, lat: -37.8 });
    expect(demographicsExplorerInvariant(state)).toBe(true);
  });
});
