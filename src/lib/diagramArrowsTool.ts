import type { Pt } from "../types";
import {
  DEFAULT_ARROW,
  MIN_ARROW_POINTS,
  clampArrowHeight,
  dedupePoints,
  newArrowId,
  type ArrowDefaults,
  type DiagramArrow,
} from "./diagramArrows";

export type ArrowToolState = {
  active: boolean;
  visible: boolean;
  arrows: DiagramArrow[];
  draft: Pt[] | null;
  defaults: ArrowDefaults;
  selectedId: string | null;
  selectedPoint: number | null;
};

export type ArrowToolAction =
  | { type: "setActive"; active: boolean }
  | { type: "setVisible"; visible: boolean }
  | { type: "replace"; arrows: DiagramArrow[]; visible?: boolean }
  | { type: "beginDraft" }
  | { type: "addPoint"; point: Pt }
  | { type: "undoPoint" }
  | { type: "finishDraft"; id?: string }
  | { type: "escape" }
  | { type: "select"; id: string | null; point?: number | null }
  | { type: "movePoint"; id: string; index: number; point: Pt }
  | { type: "deleteSelectedPoint" }
  | { type: "deleteSelected" }
  | { type: "deleteArrow"; id: string }
  | { type: "patch"; patch: Partial<ArrowDefaults> };

export function initialArrowToolState(arrows: DiagramArrow[] = []): ArrowToolState {
  return {
    active: false,
    visible: true,
    arrows,
    draft: null,
    defaults: { ...DEFAULT_ARROW },
    selectedId: null,
    selectedPoint: null,
  };
}

export function selectedArrow(state: ArrowToolState): DiagramArrow | null {
  return state.arrows.find((arrow) => arrow.id === state.selectedId) ?? null;
}

function normalisePatch(patch: Partial<ArrowDefaults>): Partial<ArrowDefaults> {
  const next = { ...patch };
  if (next.heightM !== undefined) next.heightM = Number.isFinite(next.heightM) ? clampArrowHeight(next.heightM) : DEFAULT_ARROW.heightM;
  return next;
}

function finishDraft(state: ArrowToolState, id?: string): ArrowToolState {
  const points = dedupePoints(state.draft ?? [], 0.05);
  if (points.length < MIN_ARROW_POINTS) return state;
  const arrow: DiagramArrow = { id: id ?? newArrowId(), points, ...state.defaults };
  return { ...state, arrows: [...state.arrows, arrow], draft: null, selectedId: arrow.id, selectedPoint: null };
}

export function arrowToolReducer(state: ArrowToolState, action: ArrowToolAction): ArrowToolState {
  switch (action.type) {
    case "setActive":
      return action.active
        ? { ...state, active: true }
        : { ...state, active: false, draft: null, selectedId: null, selectedPoint: null };
    case "setVisible":
      return action.visible
        ? { ...state, visible: true }
        : { ...state, visible: false, active: false, draft: null, selectedId: null, selectedPoint: null };
    case "replace":
      return {
        ...state,
        arrows: action.arrows,
        visible: action.visible ?? state.visible,
        draft: null,
        selectedId: null,
        selectedPoint: null,
      };
    case "beginDraft":
      return { ...state, active: true, visible: true, draft: [], selectedId: null, selectedPoint: null };
    case "addPoint":
      return state.draft ? { ...state, draft: [...state.draft, action.point] } : state;
    case "undoPoint":
      return state.draft ? { ...state, draft: state.draft.slice(0, -1) } : state;
    case "finishDraft":
      return finishDraft(state, action.id);
    case "escape":
      if (state.draft) return { ...state, draft: null };
      if (state.selectedPoint !== null) return { ...state, selectedPoint: null };
      if (state.selectedId) return { ...state, selectedId: null };
      return state;
    case "select":
      return { ...state, selectedId: action.id, selectedPoint: action.id ? (action.point ?? null) : null };
    case "movePoint":
      return {
        ...state,
        arrows: state.arrows.map((arrow) =>
          arrow.id === action.id && action.index >= 0 && action.index < arrow.points.length
            ? { ...arrow, points: arrow.points.map((point, i) => (i === action.index ? action.point : point)) }
            : arrow,
        ),
      };
    case "deleteSelectedPoint": {
      const arrow = selectedArrow(state);
      if (!arrow || state.selectedPoint === null || arrow.points.length <= MIN_ARROW_POINTS) return state;
      const index = state.selectedPoint;
      return {
        ...state,
        arrows: state.arrows.map((item) =>
          item.id === arrow.id ? { ...item, points: item.points.filter((_, i) => i !== index) } : item,
        ),
        selectedPoint: null,
      };
    }
    case "deleteSelected":
      return state.selectedId ? arrowToolReducer(state, { type: "deleteArrow", id: state.selectedId }) : state;
    case "deleteArrow":
      return {
        ...state,
        arrows: state.arrows.filter((arrow) => arrow.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        selectedPoint: state.selectedId === action.id ? null : state.selectedPoint,
      };
    case "patch": {
      const patch = normalisePatch(action.patch);
      if (state.selectedId) {
        return { ...state, arrows: state.arrows.map((arrow) => (arrow.id === state.selectedId ? { ...arrow, ...patch } : arrow)) };
      }
      return { ...state, defaults: { ...state.defaults, ...patch } };
    }
  }
}

export function arrowToolKeyAction(state: ArrowToolState, key: string): ArrowToolAction | null {
  if (!state.active) return null;
  if (key === "Enter") return state.draft ? { type: "finishDraft" } : null;
  if (key === "Escape") return { type: "escape" };
  if (key === "Backspace") {
    if (state.draft) return { type: "undoPoint" };
    return state.selectedPoint !== null ? { type: "deleteSelectedPoint" } : null;
  }
  if (key === "Delete") {
    if (state.draft) return { type: "undoPoint" };
    return state.selectedPoint !== null ? { type: "deleteSelectedPoint" } : { type: "deleteSelected" };
  }
  return null;
}

export type ArrowClick = { ground: Pt; hit: { id: string; point: number | null } | null };

export function arrowToolClickActions(state: ArrowToolState, click: ArrowClick): ArrowToolAction[] {
  if (!state.active) return [];
  if (state.draft) return [{ type: "addPoint", point: click.ground }];
  if (click.hit) return [{ type: "select", id: click.hit.id, point: click.hit.point }];
  if (state.selectedId) return [{ type: "select", id: null }];
  return [{ type: "beginDraft" }, { type: "addPoint", point: click.ground }];
}
