import { describe, expect, it } from "vitest";
import {
  cameraPitchDegFromEyeTarget,
  resolveSemanticHudMode,
  type SemanticHudSignals,
} from "./semanticHudMode";

function signals(partial: Partial<SemanticHudSignals>): SemanticHudSignals {
  return {
    eyeHeightM: 80,
    pitchDeg: 35,
    nearestBuildingDistanceM: 400,
    buildingScreenFill: 0,
    ...partial,
  };
}

describe("resolveSemanticHudMode", () => {
  it("chooses overview when far and elevated", () => {
    expect(resolveSemanticHudMode("overview", signals({}))).toBe("overview");
  });

  it("enters walk when low and near-horizontal", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({ eyeHeightM: 8, pitchDeg: 8, nearestBuildingDistanceM: 20, buildingScreenFill: 0.4 }),
      ),
    ).toBe("walk");
  });

  it("prefers walk over building when both match", () => {
    expect(
      resolveSemanticHudMode(
        "building",
        signals({ eyeHeightM: 9, pitchDeg: 10, nearestBuildingDistanceM: 40, buildingScreenFill: 0.25 }),
      ),
    ).toBe("walk");
  });

  it("does not use building mode at street eye height even when close", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({ eyeHeightM: 6, pitchDeg: 8, nearestBuildingDistanceM: 25, buildingScreenFill: 0.35 }),
      ),
    ).toBe("walk");
  });

  it("enters building from distance", () => {
    expect(
      resolveSemanticHudMode("overview", signals({ nearestBuildingDistanceM: 120, pitchDeg: 28, eyeHeightM: 40 })),
    ).toBe("building");
  });

  it("enters building from screen fill", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({ buildingScreenFill: 0.12, nearestBuildingDistanceM: 300, pitchDeg: 30, eyeHeightM: 60 }),
      ),
    ).toBe("building");
  });

  it("holds walk until exit thresholds", () => {
    const held = resolveSemanticHudMode(
      "walk",
      signals({ eyeHeightM: 11, pitchDeg: 16, nearestBuildingDistanceM: 30, buildingScreenFill: 0.2 }),
    );
    expect(held).toBe("walk");
    const released = resolveSemanticHudMode(
      "walk",
      signals({ eyeHeightM: 14, pitchDeg: 20, nearestBuildingDistanceM: 30, buildingScreenFill: 0.2 }),
    );
    expect(released).toBe("building");
  });

  it("holds building until distance and fill relax", () => {
    const held = resolveSemanticHudMode(
      "building",
      signals({ nearestBuildingDistanceM: 170, buildingScreenFill: 0.075, pitchDeg: 30, eyeHeightM: 50 }),
    );
    expect(held).toBe("building");
    const released = resolveSemanticHudMode(
      "building",
      signals({ nearestBuildingDistanceM: 220, buildingScreenFill: 0.02, pitchDeg: 30, eyeHeightM: 50 }),
    );
    expect(released).toBe("overview");
  });
});

describe("cameraPitchDegFromEyeTarget", () => {
  it("measures elevation angle from horizontal", () => {
    expect(cameraPitchDegFromEyeTarget([0, 10, -100], [0, 0, 0])).toBeCloseTo(5.71, 1);
    expect(cameraPitchDegFromEyeTarget([0, 0, -100], [0, 0, 0])).toBeCloseTo(0, 2);
  });
});
