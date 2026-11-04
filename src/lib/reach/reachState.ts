import {
  REACH_BUDGET_DEFAULT,
  REACH_BUDGET_MAX,
  REACH_BUDGET_MIN,
  type DemographicsExplorerLens,
  type ReachPeriod,
} from "./constants";

export type ReachExplorerState = {
  lens: DemographicsExplorerLens;
  originCellIndex: number | null;
  budgetMin: number;
  period: ReachPeriod;
  placingOrigin: boolean;
};

export type ReachExplorerAction =
  | { type: "set_lens"; lens: DemographicsExplorerLens }
  | { type: "set_budget"; budgetMin: number }
  | { type: "set_period"; period: ReachPeriod }
  | { type: "set_origin"; cellIndex: number }
  | { type: "clear_origin" }
  | { type: "set_placing"; placing: boolean };

export function initialReachExplorerState(): ReachExplorerState {
  return {
    lens: "reach",
    originCellIndex: null,
    budgetMin: REACH_BUDGET_DEFAULT,
    period: "weekday_am",
    placingOrigin: true,
  };
}

export function reduceReachExplorer(state: ReachExplorerState, action: ReachExplorerAction): ReachExplorerState {
  switch (action.type) {
    case "set_lens":
      return { ...state, lens: action.lens };
    case "set_budget": {
      const budgetMin = clampBudget(action.budgetMin);
      return state.budgetMin === budgetMin ? state : { ...state, budgetMin };
    }
    case "set_period":
      return state.period === action.period ? state : { ...state, period: action.period };
    case "set_origin":
      return {
        ...state,
        originCellIndex: action.cellIndex,
        placingOrigin: false,
      };
    case "clear_origin":
      return { ...state, originCellIndex: null, placingOrigin: true };
    case "set_placing":
      return { ...state, placingOrigin: action.placing };
    default:
      return state;
  }
}

export function clampBudget(value: number): number {
  if (!Number.isFinite(value)) return REACH_BUDGET_DEFAULT;
  return Math.min(REACH_BUDGET_MAX, Math.max(REACH_BUDGET_MIN, Math.round(value)));
}

export function reachStateInvariant(state: ReachExplorerState): boolean {
  if (state.lens !== "reach" && state.lens !== "people") return false;
  if (state.budgetMin < REACH_BUDGET_MIN || state.budgetMin > REACH_BUDGET_MAX) return false;
  if (state.originCellIndex !== null && state.originCellIndex < 0) return false;
  return true;
}
