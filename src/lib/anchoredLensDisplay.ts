export type AnchoredLensViewMode = "pinned" | null;

export type AnchoredLensView = {
  buildingId: number | null;
  mode: AnchoredLensViewMode;
};

export function resolveAnchoredLensView(input: {
  tab: "3d" | "drawing" | "satellite";
  pinnedBuildingId: number | null;
}): AnchoredLensView {
  if (input.tab !== "3d" || input.pinnedBuildingId == null) {
    return { buildingId: null, mode: null };
  }
  return { buildingId: input.pinnedBuildingId, mode: "pinned" };
}
