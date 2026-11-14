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
  setStudioCameraHeadingWithOrbit,
  shortestHeadingDeltaDeg,
} from "./studioCompassNorth";
import { studioCameraHeadingDeg, studioCompassNeedleDeg } from "./studioCompass";

describe("studioCompassNeedleDeg", () => {
  it("negates camera heading so the needle rotates opposite the view", () => {
    expect(studioCompassNeedleDeg(35)).toBe(-35);
    expect(studioCompassNeedleDeg(-20)).toBe(20);
    expect(studioCompassNeedleDeg(0)).toBeCloseTo(0, 8);
  });
});

describe("shortestHeadingDeltaDeg", () => {
  it("wraps across the 360 boundary", () => {
    expect(shortestHeadingDeltaDeg(350, 10)).toBeCloseTo(20, 5);
    expect(shortestHeadingDeltaDeg(-170, 170)).toBeCloseTo(-20, 5);
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
  function controlsStub(camera: THREE.PerspectiveCamera, target = new THREE.Vector3(0, 0, 0)) {
    const offset = new THREE.Vector3();
    const spherical = new THREE.Spherical();
    offset.copy(camera.position).sub(target);
    spherical.setFromVector3(offset);
    return {
      target,
      enabled: true,
      enableDamping: true,
      dampingFactor: 0.08,
      getAzimuthalAngle: () => spherical.theta,
      setAzimuthalAngle: (value: number) => {
        spherical.theta = value;
        offset.setFromSpherical(spherical);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
      },
      update: () => {},
    };
  }

  it("returns to north-up over the reset duration from an east camera", () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    cam.position.set(420, 280, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const heading0 = studioCameraHeadingDeg(cam);
    expect(Math.abs(heading0)).toBeGreaterThan(10);
    const controls = controlsStub(cam);
    const anim = beginCompassNorthAnim(controls as never, cam);
    let done = false;
    for (let t = 0; t <= STUDIO_COMPASS_RESET_MS; t += 16) {
      tickCompassNorthAnim(anim, t);
    }
    done = tickCompassNorthAnim(anim, STUDIO_COMPASS_RESET_MS);
    expect(done).toBe(true);
    expect(Math.abs(studioCameraHeadingDeg(cam))).toBeLessThan(2);
    expect(Math.abs(studioCompassNeedleDeg(studioCameraHeadingDeg(cam)))).toBeLessThan(1);
  });

  it("yaws from ~297° to north on a pitched camera using orbit azimuth", () => {
    const cam = new THREE.PerspectiveCamera(32, 1, 1, 10000);
    cam.position.set(260, 210, 320);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 0, 0);
    const controls = controlsStub(cam, target);
    setStudioCameraHeadingWithOrbit(controls as never, cam, 297);
    expect(Math.abs(shortestHeadingDeltaDeg(studioCameraHeadingDeg(cam), 297))).toBeLessThan(2);
    const anim = beginCompassNorthAnim(controls as never, cam);
    let done = false;
    for (let t = 0; t <= STUDIO_COMPASS_RESET_MS; t += 16) {
      tickCompassNorthAnim(anim, t);
    }
    done = tickCompassNorthAnim(anim, STUDIO_COMPASS_RESET_MS);
    expect(done).toBe(true);
    expect(Math.abs(studioCameraHeadingDeg(cam))).toBeLessThan(2);
  });
});