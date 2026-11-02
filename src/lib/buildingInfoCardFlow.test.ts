import { describe, expect, it } from "vitest";
import {
  buildingHoverHighlightId,
  buildingInfoCardDisplayBuildingId,
  buildingInfoCardInvariants,
  buildingInfoCardVisible,
  INITIAL_BUILDING_INFO_CARD,
  reduceBuildingInfoCard,
} from "./buildingInfoCardFlow";

describe("building info card flow", () => {
  it("hover highlights without pinning or showing the card", () => {
    let state = reduceBuildingInfoCard(INITIAL_BUILDING_INFO_CARD, { type: "hover", buildingId: 42 });
    expect(buildingHoverHighlightId(state)).toBe(42);
    expect(buildingInfoCardVisible(state)).toBe(false);
    expect(buildingInfoCardInvariants(state)).toEqual([]);
  });

  it("click pins the card and keeps hover on the same building", () => {
    let state = reduceBuildingInfoCard(INITIAL_BUILDING_INFO_CARD, { type: "click_building", buildingId: 7 });
    expect(buildingInfoCardVisible(state)).toBe(true);
    expect(buildingInfoCardDisplayBuildingId(state)).toBe(7);
    state = reduceBuildingInfoCard(state, { type: "hover", buildingId: 99 });
    expect(buildingInfoCardDisplayBuildingId(state)).toBe(7);
    expect(buildingHoverHighlightId(state)).toBe(99);
  });

  it("hover over another building does not replace a pinned card", () => {
    let state = reduceBuildingInfoCard(INITIAL_BUILDING_INFO_CARD, { type: "click_building", buildingId: 1 });
    state = reduceBuildingInfoCard(state, { type: "hover", buildingId: 2 });
    expect(buildingInfoCardDisplayBuildingId(state)).toBe(1);
    expect(buildingHoverHighlightId(state)).toBe(2);
  });

  it("empty click and Esc unpin", () => {
    let state = reduceBuildingInfoCard(INITIAL_BUILDING_INFO_CARD, { type: "click_building", buildingId: 3 });
    state = reduceBuildingInfoCard(state, { type: "click_empty" });
    expect(buildingInfoCardVisible(state)).toBe(false);
    state = reduceBuildingInfoCard(state, { type: "click_building", buildingId: 4 });
    state = reduceBuildingInfoCard(state, { type: "esc" });
    expect(buildingInfoCardVisible(state)).toBe(false);
    expect(buildingHoverHighlightId(state)).toBe(null);
  });
});
