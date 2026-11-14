import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { studioNorthNeedleDeg } from "./studioCompass";

describe("studioNorthNeedleDeg", () => {
  function cameraAt(x: number, y: number, z: number): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, 1, 1, 10000);
    cam.position.set(x, y, z);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    return cam;
  }

  it("points north up on screen when the camera sits south of the model", () => {
    const deg = studioNorthNeedleDeg(cameraAt(0, 280, 420));
    expect(Math.abs(deg)).toBeLessThan(2);
  });

  it("rotates when the camera yaws east of the model", () => {
    const south = studioNorthNeedleDeg(cameraAt(0, 280, 420));
    const east = studioNorthNeedleDeg(cameraAt(420, 280, 0));
    expect(Math.abs(east - south)).toBeGreaterThan(45);
  });
});
