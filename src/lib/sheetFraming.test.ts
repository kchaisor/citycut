import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ISO_FIT_MARGIN } from "./isoCamera";
import { PLAN_CAMERA_UP, planEye, sitePlanBounds } from "./planCamera";
import { sheetCropRect } from "./captureViewportPng";
import { WIND_SHEET_FRAMING, projectionCentre, wholeSiteFraming } from "./sheetFraming";
import { windSheetCropOption } from "./windSheet";

const FILL = { width: 1120, height: 900 };
const INSET = 320;
const CANVAS = { width: FILL.width + INSET, height: FILL.height };

function planCamera(inset: number) {
  const camera = new THREE.OrthographicCamera(FILL.width / -2, FILL.width / 2, FILL.height / 2, FILL.height / -2, 0.1, 5000);
  if (inset) camera.setViewOffset(FILL.width, FILL.height, -inset, 0, FILL.width + inset, FILL.height);
  return camera;
}

function pose(camera: THREE.OrthographicCamera, zoom: number, x: number, z: number) {
  const eye = planEye([x, 0, z], 1000);
  camera.up.set(...PLAN_CAMERA_UP);
  camera.position.set(...eye);
  camera.zoom = zoom;
  camera.lookAt(x, 0, z);
  camera.up.set(...PLAN_CAMERA_UP);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function toCanvas(camera: THREE.OrthographicCamera, canvas: { width: number; height: number }, x: number, z: number) {
  const ndc = new THREE.Vector3(x, 0, z).project(camera);
  return { x: ((ndc.x + 1) / 2) * canvas.width, y: ((1 - ndc.y) / 2) * canvas.height };
}

describe("wholeSiteFraming", () => {
  it("is the sheet's default framing", () => {
    expect(WIND_SHEET_FRAMING).toBe("whole-site");
  });

  it.each([
    ["square", 1000, 1000, 0],
    ["wide", 1470, 1040, 0],
    ["very wide", 2000, 400, 0],
    ["tall", 400, 1200, 0],
    ["square, left inset", 1471, 1471, INSET],
    ["wide, left inset", 1470, 1040, INSET],
  ])("projects every corner of a %s site inside the sheet crop, centred, with the fit margin", (_name, width, height, inset) => {
    const canvas = inset ? CANVAS : FILL;
    const camera = planCamera(inset);
    const bounds = sitePlanBounds(Math.max(width, height), 0, 60, width, height);
    const free = { x: 320, y: 0, width: 775, height: 900 };
    const crop = sheetCropRect(canvas, free, windSheetCropOption(false).aspect);
    const framing = wholeSiteFraming(bounds, projectionCentre(canvas, camera.view), crop);
    pose(camera, framing.zoom, framing.targetX, framing.targetZ);

    const corners = [
      toCanvas(camera, canvas, bounds.min[0], bounds.min[2]),
      toCanvas(camera, canvas, bounds.max[0], bounds.min[2]),
      toCanvas(camera, canvas, bounds.min[0], bounds.max[2]),
      toCanvas(camera, canvas, bounds.max[0], bounds.max[2]),
    ];
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThan(crop.x);
      expect(corner.y).toBeGreaterThan(crop.y);
      expect(corner.x).toBeLessThan(crop.x + crop.width);
      expect(corner.y).toBeLessThan(crop.y + crop.height);
    }
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(spanX / crop.width, spanY / crop.height)).toBeCloseTo(1 / ISO_FIT_MARGIN, 6);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(crop.x + crop.width / 2, 4);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(crop.y + crop.height / 2, 4);
  });

  it("does not depend on the saved zoom or pan, and centres an off-centre site", () => {
    const bounds = sitePlanBounds(500, 0, 40, 600, 400);
    const crop = { x: 300, y: 50, width: 900, height: 700 };
    const camera = planCamera(INSET);
    const framing = wholeSiteFraming(bounds, projectionCentre(CANVAS, camera.view), crop);
    expect(framing.zoom).toBeCloseTo(Math.min(900 / 600, 700 / 400) / ISO_FIT_MARGIN, 6);
    for (const [zoom, x, z] of [[0.3, 0, 0], [2.2, -33.6, 21]] as const) {
      pose(camera, zoom, x, z);
      pose(camera, framing.zoom, framing.targetX, framing.targetZ);
      const centre = toCanvas(camera, CANVAS, 0, 0);
      expect(centre.x).toBeCloseTo(750, 4);
      expect(centre.y).toBeCloseTo(400, 4);
    }
  });
});

describe("projectionCentre", () => {
  it("is the canvas centre without a view offset", () => {
    expect(projectionCentre(CANVAS, null)).toEqual({ x: CANVAS.width / 2, y: CANVAS.height / 2 });
  });

  it("sits at the fill centre when the view is inset", () => {
    expect(projectionCentre(CANVAS, planCamera(INSET).view)).toEqual({ x: INSET + FILL.width / 2, y: FILL.height / 2 });
  });
});
