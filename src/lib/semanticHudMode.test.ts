import { describe, expect, it } from "vitest";
import {
  cameraPitchDegFromEyeTarget,
  orbitZoomCloseT,
  resolveSemanticHudMode,
  type SemanticHudSignals,
} from "./semanticHudMode";

const MIN = 60;
const MAX = 6000;

function signals(partial: Partial<SemanticHudSignals>): SemanticHudSignals {
  return {
    eyeHeightM: 80,
    pitchDeg: 35,
    polarDeg: 55,
    orbitDistanceM: 900,
    minOrbitDistanceM: MIN,
    maxOrbitDistanceM: MAX,
    centreGroundDistanceM: 920,
    centreBuildingDistanceM: 400,
    centreHasStreetNear: false,
    hasCentreBuilding: false,
    buildingScreenFill: 0,
    ...partial,
  };
}

describe("orbitZoomCloseT", () => {
  it("is 1 at min orbit and 0 at max orbit", () => {
    expect(orbitZoomCloseT(signals({ orbitDistanceM: MIN }))).toBeCloseTo(1, 4);
    expect(orbitZoomCloseT(signals({ orbitDistanceM: MAX }))).toBeCloseTo(0, 4);
  });
});

describe("resolveSemanticHudMode", () => {
  it("chooses overview when far and elevated", () => {
    expect(resolveSemanticHudMode("overview", signals({}))).toBe("overview");
  });

  it("enters walk when near min orbit, low polar, ground hit close, and named street", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({
          orbitDistanceM: MIN * 1.1,
          polarDeg: 70,
          centreGroundDistanceM: MIN * 1.2,
          centreHasStreetNear: true,
          hasCentreBuilding: true,
          centreBuildingDistanceM: MIN * 1.1,
        }),
      ),
    ).toBe("walk");
  });

  it("uses ground hit distance when orbit target is farther than the street view", () => {
    expect(
      resolveSemanticHudMode(
        "building",
        signals({
          orbitDistanceM: MIN * 2.4,
          polarDeg: 68,
          centreGroundDistanceM: MIN * 1.05,
          centreHasStreetNear: true,
          hasCentreBuilding: true,
          centreBuildingDistanceM: MIN * 0.9,
          buildingScreenFill: 0.3,
        }),
      ),
    ).toBe("walk");
  });

  it("prefers walk over building when both match", () => {
    expect(
      resolveSemanticHudMode(
        "building",
        signals({
          orbitDistanceM: MIN * 1.08,
          polarDeg: 72,
          centreGroundDistanceM: MIN * 1.15,
          centreHasStreetNear: true,
          hasCentreBuilding: true,
          centreBuildingDistanceM: MIN,
          buildingScreenFill: 0.25,
        }),
      ),
    ).toBe("walk");
  });

  it("does not use building mode in the walk ground band even when a building is centred", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({
          orbitDistanceM: MIN * 1.12,
          polarDeg: 68,
          centreGroundDistanceM: MIN * 1.1,
          centreHasStreetNear: true,
          hasCentreBuilding: true,
          centreBuildingDistanceM: MIN * 0.95,
          buildingScreenFill: 0.35,
        }),
      ),
    ).toBe("walk");
  });

  it("enters building from centre distance within min orbit factor", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({
          orbitDistanceM: MIN * 2.2,
          centreBuildingDistanceM: MIN * 1.45,
          hasCentreBuilding: true,
          polarDeg: 52,
        }),
      ),
    ).toBe("building");
  });

  it("enters building from zoom band with centred building", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({
          orbitDistanceM: MIN + (MAX - MIN) * 0.55,
          hasCentreBuilding: true,
          centreBuildingDistanceM: MIN * 2.5,
          buildingScreenFill: 0.01,
          polarDeg: 48,
        }),
      ),
    ).toBe("building");
  });

  it("enters building from screen fill", () => {
    expect(
      resolveSemanticHudMode(
        "overview",
        signals({
          buildingScreenFill: 0.05,
          centreBuildingDistanceM: MIN * 4,
          hasCentreBuilding: true,
          polarDeg: 40,
        }),
      ),
    ).toBe("building");
  });

  it("holds walk until exit thresholds", () => {
    const held = resolveSemanticHudMode(
      "walk",
      signals({
        orbitDistanceM: MIN * 1.25,
        polarDeg: 62,
        centreGroundDistanceM: MIN * 1.45,
        centreHasStreetNear: true,
      }),
    );
    expect(held).toBe("walk");
    const released = resolveSemanticHudMode(
      "walk",
      signals({
        orbitDistanceM: MIN * 1.5,
        polarDeg: 62,
        centreGroundDistanceM: MIN * 1.45,
        centreHasStreetNear: true,
        hasCentreBuilding: true,
        centreBuildingDistanceM: MIN * 1.2,
        buildingScreenFill: 0.2,
      }),
    );
    expect(released).toBe("building");
  });

  it("holds building until distance, zoom, and fill relax", () => {
    const held = resolveSemanticHudMode(
      "building",
      signals({
        centreBuildingDistanceM: MIN * 1.75,
        hasCentreBuilding: true,
        buildingScreenFill: 0.03,
        orbitDistanceM: MIN + (MAX - MIN) * 0.62,
        polarDeg: 45,
      }),
    );
    expect(held).toBe("building");
    const released = resolveSemanticHudMode(
      "building",
      signals({
        centreBuildingDistanceM: MIN * 2.2,
        hasCentreBuilding: true,
        buildingScreenFill: 0.01,
        orbitDistanceM: MIN + (MAX - MIN) * 0.74,
        polarDeg: 45,
      }),
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
