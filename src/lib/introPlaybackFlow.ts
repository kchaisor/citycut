export type IntroPlaybackState = {
  playedCutId: string | null;
  activeCutId: string;
  introRunning: boolean;
};

export type IntroPlaybackEvent =
  | { type: "new_model"; cutId: string }
  | { type: "view_switch" }
  | { type: "rerender" }
  | { type: "intro_start" }
  | { type: "intro_finish" };

export function shouldStartIntroForCut(state: IntroPlaybackState): boolean {
  return state.playedCutId !== state.activeCutId && !state.introRunning;
}

export function reduceIntroPlayback(state: IntroPlaybackState, event: IntroPlaybackEvent): IntroPlaybackState {
  switch (event.type) {
    case "new_model":
      return {
        playedCutId: state.playedCutId,
        activeCutId: event.cutId,
        introRunning: false,
      };
    case "view_switch":
    case "rerender":
      return state;
    case "intro_start":
      if (state.playedCutId === state.activeCutId) return state;
      return { ...state, introRunning: true };
    case "intro_finish":
      return {
        playedCutId: state.activeCutId,
        activeCutId: state.activeCutId,
        introRunning: false,
      };
    default:
      return state;
  }
}

export function introPlaybackInvariants(state: IntroPlaybackState): string[] {
  const violations: string[] = [];
  if (state.introRunning && state.playedCutId === state.activeCutId) {
    violations.push("intro_replay_on_same_cut");
  }
  return violations;
}
