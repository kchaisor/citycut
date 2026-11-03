export type DemographicsColourBy = "density" | "medianAge" | "rent" | "rentersPct";

export type DemographicsExplorerTab =
  | "people"
  | "age"
  | "households"
  | "dwellings"
  | "tenure"
  | "costs";

export type DemographicsPinId = "a" | "b";

export type DemographicsPanelMode = "single" | "compare";

export type DemographicsPin = {
  east: number;
  north: number;
  label: string;
};

export type DemographicsExplorerState = {
  radiusM: number;
  colourBy: DemographicsColourBy;
  panelMode: DemographicsPanelMode;
  tab: DemographicsExplorerTab;
  pins: Partial<Record<DemographicsPinId, DemographicsPin>>;
};

export const DEMOGRAPHICS_RADIUS_MIN_M = 200;
export const DEMOGRAPHICS_RADIUS_MAX_M = 1200;
export const DEMOGRAPHICS_RADIUS_DEFAULT_M = 400;

export type DemographicsExplorerAction =
  | { type: "setRadius"; radiusM: number }
  | { type: "setColourBy"; colourBy: DemographicsColourBy }
  | { type: "setPanelMode"; panelMode: DemographicsPanelMode }
  | { type: "setTab"; tab: DemographicsExplorerTab }
  | { type: "movePin"; pin: DemographicsPinId; east: number; north: number }
  | { type: "setPinLabel"; pin: DemographicsPinId; label: string }
  | { type: "ensureComparePins" };

export function clampDemographicsRadius(radiusM: number): number {
  return Math.min(DEMOGRAPHICS_RADIUS_MAX_M, Math.max(DEMOGRAPHICS_RADIUS_MIN_M, Math.round(radiusM)));
}

export function activeDemographicsPins(state: DemographicsExplorerState): DemographicsPinId[] {
  const out: DemographicsPinId[] = [];
  if (state.pins.a) out.push("a");
  if (state.pins.b) out.push("b");
  return out;
}

export function demographicsExplorerInvariant(state: DemographicsExplorerState): boolean {
  const pins = activeDemographicsPins(state);
  if (pins.length > 2) return false;
  if (state.panelMode === "compare" && pins.length < 2) return false;
  if (state.radiusM < DEMOGRAPHICS_RADIUS_MIN_M || state.radiusM > DEMOGRAPHICS_RADIUS_MAX_M) return false;
  return true;
}

export function reduceDemographicsExplorer(
  state: DemographicsExplorerState,
  action: DemographicsExplorerAction,
): DemographicsExplorerState {
  let next: DemographicsExplorerState;
  switch (action.type) {
    case "setRadius":
      next = { ...state, radiusM: clampDemographicsRadius(action.radiusM) };
      break;
    case "setColourBy":
      next = { ...state, colourBy: action.colourBy };
      break;
    case "setPanelMode":
      next = { ...state, panelMode: action.panelMode };
      if (action.panelMode === "compare" && !state.pins.b && state.pins.a) {
        next = {
          ...next,
          pins: {
            ...next.pins,
            b: { east: state.pins.a.east + 650, north: state.pins.a.north - 180, label: "B" },
          },
        };
      }
      break;
    case "setTab":
      next = { ...state, tab: action.tab };
      break;
    case "movePin": {
      const existing = state.pins[action.pin] ?? { east: 0, north: 0, label: action.pin.toUpperCase() };
      next = {
        ...state,
        pins: {
          ...state.pins,
          [action.pin]: { ...existing, east: action.east, north: action.north },
        },
      };
      break;
    }
    case "setPinLabel": {
      const pin = state.pins[action.pin];
      if (!pin) return state;
      next = {
        ...state,
        pins: { ...state.pins, [action.pin]: { ...pin, label: action.label } },
      };
      break;
    }
    case "ensureComparePins":
      next = { ...state };
      if (!next.pins.a) {
        next.pins = {
          ...next.pins,
          a: { east: -320, north: 120, label: "Fitzroy" },
        };
      }
      if (!next.pins.b) {
        next.pins = {
          ...next.pins,
          b: { east: 280, north: -40, label: "Carlton" },
        };
      }
      next.panelMode = "compare";
      break;
    default:
      return state;
  }
  return demographicsExplorerInvariant(next) ? next : state;
}

export function initialDemographicsExplorerState(
  partial?: Partial<DemographicsExplorerState>,
): DemographicsExplorerState {
  const base: DemographicsExplorerState = {
    radiusM: DEMOGRAPHICS_RADIUS_DEFAULT_M,
    colourBy: "density",
    panelMode: "compare",
    tab: "people",
    pins: {
      a: { east: -320, north: 120, label: "Fitzroy" },
      b: { east: 280, north: -40, label: "Carlton" },
    },
  };
  const merged = { ...base, ...partial, pins: { ...base.pins, ...partial?.pins } };
  if (!demographicsExplorerInvariant(merged)) {
    throw new Error("Invalid initial demographics explorer state");
  }
  return merged;
}
