import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { northAngleRad, orthoMetresPerCssPx, planSheetFrame, roundScaleLength, scaleBarLengthM } from "./sheetScale";

function ortho(width: number, height: number, zoom: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 5000);
  camera.zoom = zoom;
  return camera;
}

function planCamera(zoom = 1): THREE.OrthographicCamera {
  const camera = ortho(1000, 800, zoom);
  camera.position.set(0, 500, 0.01);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("orthoMetresPerCssPx", () => {
  it("is the visible world height over the canvas height", () => {
    expect(orthoMetresPerCssPx(ortho(1000, 800, 1), 800)).toBeCloseTo(1, 6);
    expect(orthoMetresPerCssPx(ortho(1000, 800, 2), 800)).toBeCloseTo(0.5, 6);
    expect(orthoMetresPerCssPx(ortho(1000, 800, 0.5), 800)).toBeCloseTo(2, 6);
  });
});

describe("roundScaleLength", () => {
  it("picks 1, 2, 2.5 or 5 times a power of ten nearest the target", () => {
    expect(roundScaleLength(260)).toBe(250);
    expect(roundScaleLength(95)).toBe(100);
    expect(roundScaleLength(150)).toBe(200);
    expect(roundScaleLength(480)).toBe(500);
    expect(roundScaleLength(1900)).toBe(2000);
    expect(roundScaleLength(18)).toBe(20);
    expect(roundScaleLength(0)).toBe(0);
  });

  it("gives a bar of 15 to 20 percent of the map width at Rozelle's 1.47 km cut", () => {
    const length = scaleBarLengthM(1470);
    expect(length).toBe(250);
    expect(length / 1470).toBeGreaterThan(0.15);
    expect(length / 1470).toBeLessThan(0.2);
  });

  it("stays within 12 to 25 percent for any map width", () => {
    for (let width = 50; width < 20000; width *= 1.07) {
      const share = scaleBarLengthM(width) / width;
      expect(share).toBeGreaterThan(0.12);
      expect(share).toBeLessThan(0.25);
    }
  });
});

describe("northAngleRad", () => {
  it("is zero in the north-up plan camera", () => {
    expect(northAngleRad(planCamera())).toBeCloseTo(0, 6);
  });

  it("turns clockwise by the camera's rotation about the vertical", () => {
    const camera = planCamera();
    camera.up.set(1, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(northAngleRad(camera)).toBeCloseTo(-Math.PI / 2, 5);
    camera.up.set(-1, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(northAngleRad(camera)).toBeCloseTo(Math.PI / 2, 5);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(Math.abs(northAngleRad(camera)!)).toBeCloseTo(Math.PI, 5);
  });

  it("is null for a perspective camera", () => {
    expect(northAngleRad(new THREE.PerspectiveCamera())).toBeNull();
  });
});

describe("planSheetFrame", () => {
  it("gives the metres across the crop width and the north angle", () => {
    const frame = planSheetFrame(planCamera(0.5), 800, 600);
    expect(frame?.metresAcross).toBeCloseTo(1200, 4);
    expect(frame?.northRad).toBeCloseTo(0, 6);
  });

  it("is null for a perspective camera", () => {
    expect(planSheetFrame(new THREE.PerspectiveCamera(), 800, 600)).toBeNull();
  });
});
