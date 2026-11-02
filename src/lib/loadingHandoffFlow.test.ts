import { describe, expect, it } from "vitest";
import {
  canStartTransition,
  INITIAL_LOADING_HANDOFF,
  loadingHandoffInvariants,
  reduceLoadingHandoff,
} from "./loadingHandoffFlow";

describe("loading handoff flow", () => {
  it("starts transition only after 100% progress and scene readiness", () => {
    let state = reduceLoadingHandoff(INITIAL_LOADING_HANDOFF, { type: "processing_start" });
    state = reduceLoadingHandoff(state, { type: "progress", pct: 99 });
    expect(canStartTransition(state)).toBe(false);
    state = reduceLoadingHandoff(state, { type: "webgl_ready" });
    state = reduceLoadingHandoff(state, { type: "scene_ready" });
    state = reduceLoadingHandoff(state, { type: "progress", pct: 100 });
    expect(canStartTransition(state)).toBe(true);
    state = reduceLoadingHandoff(state, { type: "transition_start" });
    expect(loadingHandoffInvariants(state)).toEqual([]);
    state = reduceLoadingHandoff(state, { type: "transition_done" });
    expect(state.phase).toBe("settled");
  });

  it("flags blank frame when transition starts too early", () => {
    let state = reduceLoadingHandoff(INITIAL_LOADING_HANDOFF, { type: "processing_start" });
    state = reduceLoadingHandoff(state, { type: "transition_start" });
    expect(state.blankFrame).toBe(true);
    expect(loadingHandoffInvariants(state)).toContain("blank_frame");
  });

  it("clears blank frame once progress and readiness allow handoff", () => {
    let state = reduceLoadingHandoff(INITIAL_LOADING_HANDOFF, { type: "processing_start" });
    state = reduceLoadingHandoff(state, { type: "webgl_ready" });
    state = reduceLoadingHandoff(state, { type: "scene_ready" });
    state = reduceLoadingHandoff(state, { type: "progress", pct: 100 });
    expect(state.phase).toBe("transition");
    expect(state.blankFrame).toBe(false);
    expect(loadingHandoffInvariants(state)).toEqual([]);
  });
});
