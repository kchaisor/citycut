export type BuildingInfoCardState = {
  hoverBuildingId: number | null;
  pinnedBuildingId: number | null;
};

export type BuildingInfoCardEvent =
  | { type: "hover"; buildingId: number }
  | { type: "unhover" }
  | { type: "click_building"; buildingId: number }
  | { type: "click_empty" }
  | { type: "esc" };

export const INITIAL_BUILDING_INFO_CARD: BuildingInfoCardState = {
  hoverBuildingId: null,
  pinnedBuildingId: null,
};

export function buildingInfoCardVisible(state: BuildingInfoCardState): boolean {
  return state.pinnedBuildingId != null;
}

export function buildingInfoCardDisplayBuildingId(state: BuildingInfoCardState): number | null {
  return state.pinnedBuildingId;
}

export function buildingHoverHighlightId(state: BuildingInfoCardState): number | null {
  if (state.hoverBuildingId != null) return state.hoverBuildingId;
  return null;
}

export function reduceBuildingInfoCard(
  state: BuildingInfoCardState,
  event: BuildingInfoCardEvent,
): BuildingInfoCardState {
  switch (event.type) {
    case "hover":
      if (state.hoverBuildingId === event.buildingId) return state;
      return { ...state, hoverBuildingId: event.buildingId };
    case "unhover":
      if (state.hoverBuildingId == null) return state;
      return { ...state, hoverBuildingId: null };
    case "click_building":
      return {
        hoverBuildingId: event.buildingId,
        pinnedBuildingId: event.buildingId,
      };
    case "click_empty":
    case "esc":
      if (state.pinnedBuildingId == null && state.hoverBuildingId == null) return state;
      return { hoverBuildingId: null, pinnedBuildingId: null };
    default:
      return state;
  }
}

export function buildingInfoCardInvariants(state: BuildingInfoCardState): string[] {
  const violations: string[] = [];
  if (buildingInfoCardVisible(state) && state.pinnedBuildingId == null) {
    violations.push("card_visible_without_pin");
  }
  if (!buildingInfoCardVisible(state) && state.pinnedBuildingId != null) {
    violations.push("pin_without_card");
  }
  return violations;
}
