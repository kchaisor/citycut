import * as THREE from "three";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  STUDIO_COMPASS_FACE_NORTH_EVENT,
  STUDIO_COMPASS_RESET_MS,
  dispatchStudioCompassFaceNorth,
  studioCompassEaseOut,
  studioCompassNorthProgress,
  beginCompassNorthAnim,
  tickCompassNorthAnim,
} from "./studioCompassNorth";
import { studioCameraHeadingDeg, studioCompassNeedleDeg } from "./studioCompass";

describe("studioCompassNeedleDeg", () => {
  it("negates camera heading so the needle rotates opposite the view", () => {
    expect(studioCompassNeedleDeg(35)).toBe(-35);
    expect(studioCompassNeedleDeg(-20)).toBe(20);
    expect(studioCompassNeedleDeg(0)).toBeCloseTo(0, 8);
  });
});

describe("studioCompassNorthProgress", () => {
  it("eases out to full progress at the reset duration", () => {
    expect(studioCompassNorthProgress(0)).toBe(0);
    expect(studioCompassNorthProgress(STUDIO_COMPASS_RESET_MS)).toBe(1);
    expect(studioCompassEaseOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("dispatchStudioCompassFaceNorth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires the face-north event on window", () => {
    const dispatch = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatch });
    dispatchStudioCompassFaceNorth();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0]?.[0] as Event;
    expect(event.type).toBe(STUDIO_COMPASS_FACE_NORTH_EVENT);
  });
});

describe("tickCompassNorthAnim", () => {
  it("returns to north-up over the reset duration", () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    cam.position.set(420, 280, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const heading0 = studioCameraHeadingDeg(cam);
    expect(Math.abs(heading0)).toBeGreaterThan(10);
    const controls = {
      target: new THREE.Vector3(0, 0, 0),
      update: () => {},
    };
    const anim = beginCompassNorthAnim(controls as never, cam);
    let done = false;
    for (let t = 0; t <= STUDIO_COMPASS_RESET_MS; t += 16) {
      done = tickCompassNorthAnim(anim, 16);
    }
    expect(done).toBe(true);
    expect(Math.abs(studioCameraHeadingDeg(cam))).toBeLessThan(2);
  });
});