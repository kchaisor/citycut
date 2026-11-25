import type { Pt } from "../types";
import {
  DEFAULT_ARROW,
  MIN_ARROW_POINTS,
  clampArrowHeight,
  clampArrowSpeed,
  clampArrowWidth,
  flattenArrowHeights,
  newArrowId,
  smoothArrowHeights,
  type ArrowDefaults,
  type DiagramArrow,
} from "./diagramArrows";
import { dedupePoints } from "./diagramArrowsPath";

export type ArrowToolState = {
  active: boolean;
  visible: boolean;
  arrows: DiagramArrow[];
  draft: Pt[] | null;
  defaults: ArrowDefaults;
  selectedId: string | null;
  selectedPoint: number | null;
  past: DiagramArrow[][];
};

export const MAX_ARROW_HISTORY = 30;
export const MIN_NODE_ELEVATION_M = -100;
export const MAX_NODE_ELEVATION_M = 2000;

type BaseAt = (east: number, north: number) => number;

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
  | { type: "moveArrow"; id: string; dx: number; dy: number }
  | { type: "setPointHeight"; id: string; index: number; height: number; bases?: number[] }
  | { type: "flatten"; groundAt?: BaseAt }
  | { type: "smooth"; groundAt?: BaseAt }
  | { type: "undo" }
  | { type: "commitHistory"; before: DiagramArrow[] }
  | { type: "deleteSelectedPoint" }
  | { type: "deleteSelected" }
  | { type: "deleteArrow"; id: string }
  | { type: "patch"; patch: Partial<ArrowDefaults>; record?: boolean };

export function initialArrowToolState(arrows: DiagramArrow[] = []): ArrowToolState {
  return {
    active: false,
    visible: true,
    arrows,
    draft: null,
    defaults: { ...DEFAULT_ARROW },
    selectedId: null,
    selectedPoint: null,
    past: [],
  };
}

export function selectedArrow(state: ArrowToolState): DiagramArrow | null {
  return state.arrows.find((arrow) => arrow.id === state.selectedId) ?? null;
}

function normalisePatch(patch: Partial<ArrowDefaults>): Partial<ArrowDefaults> {
  const next = { ...patch };
  if (next.heightM !== undefined) next.heightM = Number.isFinite(next.heightM) ? clampArrowHeight(next.heightM) : DEFAULT_ARROW.heightM;
  if (next.width !== undefined) next.width = Number.isFinite(next.width) ? clampArrowWidth(next.width) : DEFAULT_ARROW.width;
  if (next.speed !== undefined) next.speed = Number.isFinite(next.speed) ? clampArrowSpeed(next.speed) : DEFAULT_ARROW.speed;
  return next;
}

function pushHistory(past: DiagramArrow[][], before: DiagramArrow[]): DiagramArrow[][] {
  return [...past, before].slice(-MAX_ARROW_HISTORY);
}

function recorded(state: ArrowToolState, arrows: DiagramArrow[]): ArrowToolState {
  return { ...state, arrows, past: pushHistory(state.past, state.arrows) };
}

function nodeBases(arrow: DiagramArrow, groundAt: BaseAt = () => 0): number[] {
  return arrow.pointHeights?.length === arrow.points.length
    ? arrow.pointHeights
    : arrow.points.map((point) => groundAt(point[0], point[1]));
}

function reshape(state: ArrowToolState, edit: (arrow: DiagramArrow) => DiagramArrow): DiagramArrow[] {
  return state.arrows.map((arrow) => (arrow.id === state.selectedId ? edit(arrow) : arrow));
}

function finishDraft(state: ArrowToolState, id?: string): ArrowToolState {
  const points = dedupePoints(state.draft ?? [], 0.05);
  if (points.length < MIN_ARROW_POINTS) return state;
  const arrow: DiagramArrow = { id: id ?? newArrowId(), points, ...state.defaults };
  return { ...recorded(state, [...state.arrows, arrow]), draft: null, selectedId: arrow.id, selectedPoint: null };
}

export function arrowToolReducer(state: ArrowToolState, action: ArrowToolAction): ArrowToolState {
  switch (action.type) {
    case "setActive":
      return action.active
        ? { ...state, active: true, visible: true }
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
        past: [],
      };
    case "beginDraft":
      return { ...state, active: true, visible: true, draft: [], selectedId: null, selectedPoint: null };
    case "addPoint":
      return state.draft ? { ...state, draft: [...state.draft, action.point], selectedId: null, selectedPoint: null } : state;
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
      return {
        ...state,
        draft: action.id ? null : state.draft,
        selectedId: action.id,
        selectedPoint: action.id ? (action.point ?? null) : null,
      };
    case "movePoint":
      return {
        ...state,
        arrows: state.arrows.map((arrow) =>
          arrow.id === action.id && action.index >= 0 && action.index < arrow.points.length
            ? { ...arrow, points: arrow.points.map((point, i) => (i === action.index ? action.point : point)) }
            : arrow,
        ),
      };
    case "moveArrow":
      return {
        ...state,
        arrows: state.arrows.map((arrow) =>
          arrow.id === action.id
            ? { ...arrow, points: arrow.points.map((point): Pt => [point[0] + action.dx, point[1] + action.dy]) }
            : arrow,
        ),
      };
    case "setPointHeight":
      return {
        ...state,
        arrows: state.arrows.map((arrow) => {
          if (arrow.id !== action.id || action.index < 0 || action.index >= arrow.points.length) return arrow;
          const bases = arrow.pointHeights?.length === arrow.points.length ? arrow.pointHeights : action.bases;
          if (!bases || bases.length !== arrow.points.length) return arrow;
          const low = MIN_NODE_ELEVATION_M - arrow.heightM;
          const high = MAX_NODE_ELEVATION_M - arrow.heightM;
          const height = Math.round(Math.min(high, Math.max(low, action.height)) * 100) / 100;
          return { ...arrow, pointHeights: bases.map((value, i) => (i === action.index ? height : value)) };
        }),
      };
    case "flatten":
    case "smooth": {
      const arrow = selectedArrow(state);
      if (!arrow) return state;
      const bases = nodeBases(arrow, action.groundAt);
      const pointHeights = action.type === "flatten" ? flattenArrowHeights(bases) : smoothArrowHeights(arrow.points, bases);
      return recorded(state, reshape(state, (item) => ({ ...item, pointHeights })));
    }
    case "undo": {
      const before = state.past[state.past.length - 1];
      if (!before) return state;
      const arrow = before.find((item) => item.id === state.selectedId);
      return {
        ...state,
        arrows: before,
        past: state.past.slice(0, -1),
        selectedId: arrow ? state.selectedId : null,
        selectedPoint: arrow && state.selectedPoint !== null && state.selectedPoint < arrow.points.length ? state.selectedPoint : null,
      };
    }
    case "commitHistory":
      return action.before === state.arrows ? state : { ...state, past: pushHistory(state.past, action.before) };
    case "deleteSelectedPoint": {
      const arrow = selectedArrow(state);
      if (!arrow || state.selectedPoint === null || arrow.points.length <= MIN_ARROW_POINTS) return state;
      const index = state.selectedPoint;
      const without = <T>(list: T[]): T[] => list.filter((_, i) => i !== index);
      const arrows = state.arrows.map((item) => {
        if (item.id !== arrow.id) return item;
        const next: DiagramArrow = { ...item, points: without(item.points) };
        if (item.pointHeights) next.pointHeights = without(item.pointHeights);
        return next;
      });
      return { ...recorded(state, arrows), selectedPoint: null };
    }
    case "deleteSelected":
      return state.selectedId ? arrowToolReducer(state, { type: "deleteArrow", id: state.selectedId }) : state;
    case "deleteArrow":
      return {
        ...recorded(
          state,
          state.arrows.filter((arrow) => arrow.id !== action.id),
        ),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        selectedPoint: state.selectedId === action.id ? null : state.selectedPoint,
      };
    case "patch": {
      const patch = normalisePatch(action.patch);
      if (state.selectedId && !state.draft) {
        const arrows = reshape(state, (arrow) => ({ ...arrow, ...patch }));
        return action.record === false ? { ...state, arrows } : recorded(state, arrows);
      }
      return { ...state, defaults: { ...state.defaults, ...patch } };
    }
  }
}

export type ArrowKeyContext = { editable: boolean; panel: boolean };

export const ARROW_PANEL_CLASS = "arrows-card";

export function arrowKeyContext(target: EventTarget | null): ArrowKeyContext {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return { editable: false, panel: false };
  const editable = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
  return { editable, panel: Boolean(el.closest?.(`.${ARROW_PANEL_CLASS}`)) };
}

const NO_CONTEXT: ArrowKeyContext = { editable: false, panel: false };

export function arrowToolKeyAction(
  state: ArrowToolState,
  key: string,
  context: ArrowKeyContext = NO_CONTEXT,
  modifier = false,
): ArrowToolAction | null {
  if (!state.active) return null;
  const undoKey = modifier && key.toLowerCase() === "z";
  if (context.editable && !(context.panel && (key === "Enter" || key === "Escape" || undoKey))) return null;
  if (undoKey) {
    if (state.draft) return { type: "undoPoint" };
    return state.past.length > 0 ? { type: "undo" } : null;
  }
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

export const DOUBLE_CLICK_MS = 350;
export const DOUBLE_CLICK_PX = 6;

export type ClickStamp = { t: number; x: number; y: number };

export function isDoubleClick(previous: ClickStamp | null, next: ClickStamp): boolean {
  return (
    previous !== null &&
    next.t - previous.t <= DOUBLE_CLICK_MS &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_CLICK_PX
  );
}

export function arrowToolClickActions(state: ArrowToolState, click: ArrowClick, double = false): ArrowToolAction[] {
  if (!state.active) return [];
  if (double && state.draft) return [{ type: "finishDraft" }];
  if (state.draft) return [{ type: "addPoint", point: click.ground }];
  if (click.hit) return [{ type: "select", id: click.hit.id, point: click.hit.point }];
  if (state.selectedId && state.selectedPoint !== null) return [{ type: "select", id: state.selectedId, point: null }];
  if (state.selectedId) return [{ type: "select", id: null }];
  return [{ type: "beginDraft" }, { type: "addPoint", point: click.ground }];
}
