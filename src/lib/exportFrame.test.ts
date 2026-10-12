import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cameraForExportFrame, exportFrameSize } from "./exportFrame";

describe("cameraForExportFrame", () => {
  it("widens a perspective camera to the export aspect without touching the original", () => {
    const camera = new THREE.PerspectiveCamera(40, 1064 / 844, 1, 5000);
    camera.position.set(596.83, 504.309, 658.043);
    camera.lookAt(0, 45.209, 0);
    const before = camera.projectionMatrix.clone();
    const copy = cameraForExportFrame(camera, 1440, 844);
    expect(copy).not.toBe(camera);
    expect(copy.aspect).toBeCloseTo(1440 / 844, 6);
    expect(copy.fov).toBe(40);
    expect(copy.position.toArray()).toEqual(camera.position.toArray());
    expect(copy.quaternion.toArray()).toEqual(camera.quaternion.toArray());
    expect(camera.aspect).toBeCloseTo(1064 / 844, 6);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
  });

  it("keeps the orthographic zoom and widens the frustum", () => {
    const camera = new THREE.OrthographicCamera(-532, 532, 422, -422, 1, 5000);
    camera.zoom = 0.7815;
    camera.updateProjectionMatrix();
    const copy = cameraForExportFrame(camera, 1440, 844);
    expect([copy.left, copy.right, copy.top, copy.bottom]).toEqual([-720, 720, 422, -422]);
    expect(copy.zoom).toBe(0.7815);
    expect([camera.left, camera.right]).toEqual([-532, 532]);
  });

  it("refuses a frame that is not on screen", () => {
    expect(() => cameraForExportFrame(new THREE.PerspectiveCamera(), 0, 844)).toThrow();
  });
});

function fakeCanvas(width: number, height: number, viewportWidth?: number): HTMLElement {
  const viewport = viewportWidth === undefined ? null : { clientWidth: viewportWidth };
  return { clientWidth: width, clientHeight: height, closest: () => viewport } as unknown as HTMLElement;
}

describe("exportFrameSize", () => {
  it("uses the full model area width and the canvas height", () => {
    expect(exportFrameSize(fakeCanvas(1064, 844, 1440))).toEqual({ width: 1440, height: 844 });
  });

  it("is the same with the sidebar collapsed", () => {
    expect(exportFrameSize(fakeCanvas(1392, 844, 1440))).toEqual({ width: 1440, height: 844 });
  });

  it("falls back to the canvas when there is no model area", () => {
    expect(exportFrameSize(fakeCanvas(800, 600))).toEqual({ width: 800, height: 600 });
  });
});
