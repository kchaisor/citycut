export type MassingToolPhase = "idle" | "drawing" | "drawingPreview" | "selected" | "draggingHeight";

export type MassingToolState = {
  toolEnabled: boolean;
  drawArmed: boolean;
  phase: MassingToolPhase;
  selectedId: string | null;
  drawVertices: [number, number][] | null;
  drawHover: [number, number] | null;
  heightDragFloors: number | null;
};

export const INITIAL_MASSING_TOOL_STATE: MassingToolState = {
  toolEnabled: false,
  drawArmed: false,
  phase: "idle",
  selectedId: null,
  drawVertices: null,
  drawHover: null,
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
  | { type: "ADD_VERTEX"; east: number; north: number }
  | { type: "COMMIT_DRAW" }
  | { type: "SELECT"; id: string }
  | { type: "DESELECT" }
  | { type: "START_HEIGHT_DRAG"; floors: number }
  | { type: "HEIGHT_DRAG"; floors: number }
  | { type: "END_HEIGHT_DRAG" }
  | { type: "DELETE_SELECTED" };

function clearDrawDraft(state: MassingToolState): MassingToolState {
  return { ...state, drawVertices: null, drawHover: null };
}

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
        return { ...clearDrawDraft({ ...state, drawArmed: false, phase: "idle" }) };
      }
      return { ...state, drawArmed: false };
    case "LEAVE_3D_VIEW":
      if (state.phase === "drawing" || state.phase === "drawingPreview" || state.phase === "draggingHeight") {
        return clearDrawDraft({
          ...state,
          phase: state.selectedId ? "selected" : "idle",
          heightDragFloors: null,
        });
      }
      return state;
    case "RETURN_3D_VIEW":
      return state;
    case "CANCEL":
      if (!state.toolEnabled) return state;
      if (state.phase === "drawing" || state.phase === "drawingPreview") {
        return clearDrawDraft({ ...state, phase: "idle" });
      }
      if (state.phase === "draggingHeight") {
        return { ...state, phase: "selected", heightDragFloors: null };
      }
      return state;
    case "POINTER_DOWN_GROUND": {
      if (!state.toolEnabled) return state;
      if (state.phase === "draggingHeight") return state;
      if (event.hitBlockId) {
        return clearDrawDraft({
          ...state,
          phase: "selected",
          selectedId: event.hitBlockId,
        });
      }
      if (!state.drawArmed) {
        if (state.phase === "selected") {
          return clearDrawDraft({ ...state, phase: "idle", selectedId: null });
        }
        return state;
      }
      if (state.phase === "drawingPreview") return state;
      return {
        ...state,
        phase: "drawing",
        selectedId: null,
        drawVertices: [[event.east, event.north]],
        drawHover: [event.east, event.north],
      };
    }
    case "ADD_VERTEX": {
      if (!state.toolEnabled || !state.drawArmed || state.phase !== "drawingPreview") return state;
      const base = state.drawVertices ?? [];
      if (base.length === 0) return state;
      return {
        ...state,
        drawVertices: [...base, [event.east, event.north]],
        drawHover: [event.east, event.north],
      };
    }
    case "POINTER_MOVE": {
      if ((state.phase !== "drawing" && state.phase !== "drawingPreview") || !state.drawVertices?.length) return state;
      return { ...state, drawHover: [event.east, event.north] };
    }
    case "POINTER_UP":
      if (state.phase === "drawing") return { ...state, phase: "drawingPreview" };
      return state;
    case "COMMIT_DRAW":
      if (state.phase !== "drawing" && state.phase !== "drawingPreview") return state;
      return clearDrawDraft({ ...state, phase: "idle" });
    case "SELECT":
      if (!state.toolEnabled) return state;
      return clearDrawDraft({
        ...state,
        phase: "selected",
        selectedId: event.id,
      });
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
