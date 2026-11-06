export type MassingToolPhase = "idle" | "drawing" | "drawingPreview" | "selected" | "draggingHeight";

export type MassingToolState = {
  toolEnabled: boolean;
  drawArmed: boolean;
  phase: MassingToolPhase;
  selectedId: string | null;
  drawStart: [number, number] | null;
  drawEnd: [number, number] | null;
  heightDragFloors: number | null;
};

export const INITIAL_MASSING_TOOL_STATE: MassingToolState = {
  toolEnabled: false,
  drawArmed: false,
  phase: "idle",
  selectedId: null,
  drawStart: null,
  drawEnd: null,
  heightDragFloors: null,
};

export type MassingToolEvent =
  | { type: "ENABLE_TOOL" }
  | { type: "DISABLE_TOOL" }
  | { type: "ARM_DRAW" }
  | { type: "DISARM_DRAW" }
  | { type: "LEAVE_3D_VIEW" }
  | { type: "RETURN_3D_VIEW" }
  | { type: "POINTER_DOWN_GROUND"; east: number; north: number; hitBlockId: string | null }
  | { type: "POINTER_MOVE"; east: number; north: number }
  | { type: "POINTER_UP" }
  | { type: "CANCEL" }
  | { type: "COMMIT_DRAW" }
  | { type: "SELECT"; id: string }
  | { type: "DESELECT" }
  | { type: "START_HEIGHT_DRAG"; floors: number }
  | { type: "HEIGHT_DRAG"; floors: number }
  | { type: "END_HEIGHT_DRAG" }
  | { type: "DELETE_SELECTED" };

export function reduceMassingTool(state: MassingToolState, event: MassingToolEvent): MassingToolState {
  switch (event.type) {
    case "ENABLE_TOOL":
      return { ...state, toolEnabled: true };
    case "DISABLE_TOOL":
      return {
        ...INITIAL_MASSING_TOOL_STATE,
        toolEnabled: false,
      };
    case "ARM_DRAW":
      if (!state.toolEnabled) return state;
      return { ...state, drawArmed: true };
    case "DISARM_DRAW":
      if (!state.drawArmed && state.phase !== "drawing" && state.phase !== "drawingPreview") {
        return { ...state, drawArmed: false };
      }
      if (state.phase === "drawing" || state.phase === "drawingPreview") {
        return { ...state, drawArmed: false, phase: "idle", drawStart: null, drawEnd: null };
      }
      return { ...state, drawArmed: false };
    case "LEAVE_3D_VIEW":
      if (state.phase === "drawing" || state.phase === "drawingPreview" || state.phase === "draggingHeight") {
        return {
          ...state,
          phase: state.selectedId ? "selected" : "idle",
          drawStart: null,
          drawEnd: null,
          heightDragFloors: null,
        };
      }
      return state;
    case "RETURN_3D_VIEW":
      return state;
    case "CANCEL":
      if (!state.toolEnabled) return state;
      if (state.phase === "drawing" || state.phase === "drawingPreview") {
        return { ...state, phase: "idle", drawStart: null, drawEnd: null };
      }
      if (state.phase === "draggingHeight") {
        return { ...state, phase: "selected", heightDragFloors: null };
      }
      return state;
    case "POINTER_DOWN_GROUND": {
      if (!state.toolEnabled) return state;
      if (state.phase === "draggingHeight") return state;
      if (event.hitBlockId) {
        return {
          ...state,
          phase: "selected",
          selectedId: event.hitBlockId,
          drawStart: null,
          drawEnd: null,
        };
      }
      if (!state.drawArmed) {
        if (state.phase === "selected") {
          return { ...state, phase: "idle", selectedId: null, drawStart: null, drawEnd: null };
        }
        return state;
      }
      if (state.phase === "drawingPreview") {
        return { ...state, drawEnd: [event.east, event.north] };
      }
      return {
        ...state,
        phase: "drawing",
        selectedId: null,
        drawStart: [event.east, event.north],
        drawEnd: [event.east, event.north],
      };
    }
    case "POINTER_MOVE": {
      if ((state.phase !== "drawing" && state.phase !== "drawingPreview") || !state.drawStart) return state;
      return { ...state, drawEnd: [event.east, event.north] };
    }
    case "POINTER_UP":
      // A press-release without a drag-length draw becomes a click-click preview:
      // the start stays anchored and the end follows the hover until the next click.
      if (state.phase === "drawing") return { ...state, phase: "drawingPreview" };
      return state;
    case "COMMIT_DRAW":
      if (state.phase !== "drawing" && state.phase !== "drawingPreview") return state;
      return { ...state, phase: "idle", drawStart: null, drawEnd: null };
    case "SELECT":
      if (!state.toolEnabled) return state;
      return {
        ...state,
        phase: "selected",
        selectedId: event.id,
        drawStart: null,
        drawEnd: null,
      };
    case "DESELECT":
      if (state.phase === "draggingHeight") return state;
      return { ...state, phase: "idle", selectedId: null };
    case "START_HEIGHT_DRAG":
      if (state.phase !== "selected" || !state.selectedId) return state;
      return { ...state, phase: "draggingHeight", heightDragFloors: event.floors };
    case "HEIGHT_DRAG":
      if (state.phase !== "draggingHeight") return state;
      return { ...state, heightDragFloors: event.floors };
    case "END_HEIGHT_DRAG":
      if (state.phase !== "draggingHeight") return state;
      return { ...state, phase: "selected", heightDragFloors: null };
    case "DELETE_SELECTED":
      if (!state.selectedId) return state;
      return { ...state, phase: "idle", selectedId: null };
    default:
      return state;
  }
}

export function massingToolOrbitLocked(state: MassingToolState): boolean {
  const drawing = state.drawArmed && (state.phase === "drawing" || state.phase === "drawingPreview");
  return drawing || state.phase === "draggingHeight";
}

export function massingToolIsDrawing(state: MassingToolState): boolean {
  return state.phase === "drawing" || state.phase === "drawingPreview";
}
