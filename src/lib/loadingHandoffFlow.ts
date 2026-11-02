export type LoadingHandoffPhase = "idle" | "processing" | "bridge" | "transition" | "settled";

export type LoadingHandoffState = {
  phase: LoadingHandoffPhase;
  progressPct: number;
  webglReady: boolean;
  sceneReady: boolean;
  blankFrame: boolean;
};

export type LoadingHandoffEvent =
  | { type: "processing_start" }
  | { type: "progress"; pct: number }
  | { type: "webgl_ready" }
  | { type: "scene_ready" }
  | { type: "transition_start" }
  | { type: "transition_done" };

export const INITIAL_LOADING_HANDOFF: LoadingHandoffState = {
  phase: "idle",
  progressPct: 0,
  webglReady: false,
  sceneReady: false,
  blankFrame: false,
};

export function canStartTransition(state: LoadingHandoffState): boolean {
  return state.progressPct >= 100 && state.webglReady && state.sceneReady;
}

function maybeBeginTransition(state: LoadingHandoffState): LoadingHandoffState {
  if (!canStartTransition(state) || state.phase === "transition" || state.phase === "settled") return state;
  return { ...state, phase: "transition", blankFrame: false };
}

export function reduceLoadingHandoff(state: LoadingHandoffState, event: LoadingHandoffEvent): LoadingHandoffState {
  switch (event.type) {
    case "processing_start":
      return {
        phase: "processing",
        progressPct: 0,
        webglReady: false,
        sceneReady: false,
        blankFrame: false,
      };
    case "progress":
      return maybeBeginTransition({
        ...state,
        progressPct: Math.max(state.progressPct, Math.min(100, event.pct)),
      });
    case "webgl_ready":
      return maybeBeginTransition({ ...state, webglReady: true });
    case "scene_ready":
      return maybeBeginTransition({ ...state, sceneReady: true });
    case "transition_start":
      if (!canStartTransition(state)) return { ...state, blankFrame: true };
      return { ...state, phase: "transition", blankFrame: false };
    case "transition_done":
      return {
        phase: "settled",
        progressPct: 100,
        webglReady: true,
        sceneReady: true,
        blankFrame: false,
      };
    default:
      return state;
  }
}

export function loadingHandoffInvariants(state: LoadingHandoffState): string[] {
  const violations: string[] = [];
  if (state.phase === "transition" && state.progressPct < 100) violations.push("transition_before_100");
  if (state.phase === "transition" && !state.webglReady) violations.push("transition_before_webgl");
  if (state.phase === "transition" && !state.sceneReady) violations.push("transition_before_scene");
  if (state.blankFrame) violations.push("blank_frame");
  return violations;
}
