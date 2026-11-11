import { describe, expect, it } from "vitest";
import { REACH_BUDGET_DEFAULT, REACH_BUDGET_MAX, REACH_BUDGET_MIN } from "./constants";
import {
  clampBudget,
  initialReachExplorerState,
  reachStateInvariant,
  reduceReachExplorer,
} from "./reachState";

describe("reachState", () => {
  it("clamps budget changes instead of storing out-of-range values", () => {
    expect(clampBudget(2)).toBe(REACH_BUDGET_MIN);
    expect(clampBudget(99)).toBe(REACH_BUDGET_MAX);
    expect(clampBudget(15.7)).toBe(16);
  });

  it("keeps origin and clears placing flag when an origin is picked", () => {
    const start = initialReachExplorerState();
    const next = reduceReachExplorer(start, { type: "set_origin", cellIndex: 42 });
    expect(next.originCellIndex).toBe(42);
    expect(next.placingOrigin).toBe(false);
    expect(reachStateInvariant(next)).toBe(true);
  });

  it("does not rewrite state when budget is unchanged after clamping", () => {
    const start = { ...initialReachExplorerState(), budgetMin: REACH_BUDGET_DEFAULT };
    const next = reduceReachExplorer(start, { type: "set_budget", budgetMin: REACH_BUDGET_DEFAULT });
    expect(next).toBe(start);
  });
});
