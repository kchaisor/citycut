import { describe, expect, it } from "vitest";
import { computePerspectiveViewportPose } from "./perspectiveViewportFit";
import type { SolarViewSettings } from "../components/SolarHeliodon";

const baseSolar: SolarViewSettings = {
  showPath: false,
  castShadows: false,
  radiusFactor: 1.75,
  year: 2026,
  month: 9,
  day: 22,
  hour: 15,
  minute: 0,
};

const fitInput = (solar: SolarViewSettings) => ({
  side: 1000,
  lift: 12,
  groundY: 0,
  siteTopY: 48,
  heliodonRadius: 875,
  solar,
  lat: -37.8005,
  lon: 145.0005,
  fov: 32,
  aspect: 16 / 10,
});

function expectPoseUnchanged(
  a: ReturnType<typeof computePerspectiveViewportPose>,
  b: ReturnType<typeof computePerspectiveViewportPose>,
) {
  for (let i = 0; i < 3; i++) {
    expect(a.eye[i]).toBeCloseTo(b.eye[i]!, 6);
    expect(a.target[i]).toBeCloseTo(b.target[i]!, 6);
  }
}

describe("computePerspectiveViewportPose", () => {
  it("keeps eye and target when toggling the sun path overlay", () => {
    const off = computePerspectiveViewportPose(fitInput({ ...baseSolar, showPath: false }));
    const on = computePerspectiveViewportPose(fitInput({ ...baseSolar, showPath: true }));
    expectPoseUnchanged(off, on);
  });

  it("keeps eye and target when changing sun path size, date, and time", () => {
    const base = computePerspectiveViewportPose(fitInput(baseSolar));
    const sized = computePerspectiveViewportPose(
      fitInput({ ...baseSolar, showPath: true, radiusFactor: 2.5 }),
    );
    const dated = computePerspectiveViewportPose(
      fitInput({ ...baseSolar, showPath: true, month: 6, day: 21, hour: 9, minute: 30 }),
    );
    expectPoseUnchanged(base, sized);
    expectPoseUnchanged(base, dated);
  });
});
