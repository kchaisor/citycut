import { describe, expect, it } from "vitest";
import { resolveAnchoredLensView } from "./anchoredLensDisplay";

describe("resolveAnchoredLensView", () => {
  it("shows no lens card on hover alone", () => {
    expect(resolveAnchoredLensView({ tab: "3d", pinnedBuildingId: null })).toEqual({
      buildingId: null,
      mode: null,
    });
  });

  it("shows pinned lens after click", () => {
    expect(resolveAnchoredLensView({ tab: "3d", pinnedBuildingId: 42 })).toEqual({
      buildingId: 42,
      mode: "pinned",
    });
  });

  it("hides lens outside 3d tab even when pinned", () => {
    expect(resolveAnchoredLensView({ tab: "drawing", pinnedBuildingId: 42 })).toEqual({
      buildingId: null,
      mode: null,
    });
  });
});
