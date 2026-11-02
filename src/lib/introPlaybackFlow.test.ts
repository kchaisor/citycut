import { describe, expect, it } from "vitest";
import {
  introPlaybackInvariants,
  reduceIntroPlayback,
  shouldStartIntroForCut,
  type IntroPlaybackState,
} from "./introPlaybackFlow";

describe("intro playback flow", () => {
  const cutA = "-37.81270,144.98061,500";
  const cutB = "-37.81270,144.98061,600";

  it("plays once per new cut and skips on view switches", () => {
    let state: IntroPlaybackState = { playedCutId: null, activeCutId: cutA, introRunning: false };
    expect(shouldStartIntroForCut(state)).toBe(true);
    state = reduceIntroPlayback(state, { type: "intro_start" });
    expect(state.introRunning).toBe(true);
    state = reduceIntroPlayback(state, { type: "view_switch" });
    expect(state.introRunning).toBe(true);
    state = reduceIntroPlayback(state, { type: "intro_finish" });
    expect(state.playedCutId).toBe(cutA);
    expect(shouldStartIntroForCut(state)).toBe(false);
    state = reduceIntroPlayback(state, { type: "rerender" });
    expect(introPlaybackInvariants(state)).toEqual([]);
  });

  it("replays only when the cut identity changes", () => {
    let state: IntroPlaybackState = { playedCutId: cutA, activeCutId: cutA, introRunning: false };
    expect(shouldStartIntroForCut(state)).toBe(false);
    state = reduceIntroPlayback(state, { type: "new_model", cutId: cutB });
    expect(shouldStartIntroForCut(state)).toBe(true);
  });
});
