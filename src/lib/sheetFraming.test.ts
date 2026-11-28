import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ISO_FIT_MARGIN } from "./isoCamera";
import { PLAN_CAMERA_UP, planEye, sitePlanBounds } from "./planCamera";
import { sheetCropRect } from "./captureViewportPng";
import {
  WIND_SHEET_FRAMING,
  WIND_SHEET_FRAMING_STORAGE_KEY,
  WIND_SHEET_MARGIN,
  cutMarginTrim,
  projectionCentre,
  readWindSheetFramingStore,
  windSheetFramingForCut,
  wholeSiteFraming,
  writeWindSheetFramingStore,
} from "./sheetFraming";
import { trimmedFrame, windSheetCropOption } from "./windSheet";

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

describe("sheet map scale for the Rozelle 1.47 km cut", () => {
  it("keeps the whole cut in the capture and reports exactly the cut width after the trim", () => {
    const crop = windSheetCropOption(false);
    const rect = sheetCropRect({ width: 1440, height: 900 }, { x: 0, y: 0, width: 1440, height: 900 }, crop.aspect);
    expect(rect.width).toBeCloseTo(943.6, 0);
    expect(rect.height).toBe(900);

    const cut = 1471;
    const zoom = wholeSiteFraming(sitePlanBounds(cut, 0, 60), { x: 720, y: 450 }, rect).zoom;
    expect(zoom).toBeCloseTo(0.5665, 3);

    const ratio = crop.minWidthPx / rect.width;
    const captureWidthPx = Math.round(crop.minWidthPx);
    const cutPx = cut * zoom * ratio;
    expect(cutPx).toBeLessThan(rect.height * ratio);
    expect(cutPx).toBeLessThan(captureWidthPx);

    const metresAcross = rect.width / zoom;
    const trimmed = trimmedFrame({ metresAcross, northRad: null }, captureWidthPx, { x: 0, y: 0, width: Math.round(cutPx), height: Math.round(cutPx) });
    expect(trimmed.metresAcross).toBeCloseTo(cut, -1);
  });
});

describe("wind sheet framing store", () => {
  function memory(initial?: string) {
    const map = new Map<string, string>(initial === undefined ? [] : [[WIND_SHEET_FRAMING_STORAGE_KEY, initial]]);
    return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
  }

  it("round-trips a choice per site and falls back to whole site", () => {
    const storage = memory();
    expect(windSheetFramingForCut(readWindSheetFramingStore(storage), "a")).toBe("whole-site");
    expect(writeWindSheetFramingStore(storage, { a: "saved", b: "whole-site" })).toBe(true);
    const store = readWindSheetFramingStore(storage);
    expect(windSheetFramingForCut(store, "a")).toBe("saved");
    expect(windSheetFramingForCut(store, "b")).toBe("whole-site");
    expect(windSheetFramingForCut(store, "c")).toBe("whole-site");
  });

  it.each(["not json", "[]", "null", '{"a":"zoomed","b":3}'])("ignores invalid stored value %s", (raw) => {
    const store = readWindSheetFramingStore(memory(raw));
    expect(windSheetFramingForCut(store, "a")).toBe("whole-site");
    expect(windSheetFramingForCut(store, "b")).toBe("whole-site");
  });

  it("reports a storage that refuses writes", () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error("full"); } };
    expect(writeWindSheetFramingStore(refusing, { a: "saved" })).toBe(false);
  });
});

describe("whole-site margin", () => {
  it("keeps the cut at about 91% of the trimmed map, centred, with the bar exact", () => {
    const crop = windSheetCropOption(false);
    const rect = sheetCropRect({ width: 1440, height: 900 }, { x: 0, y: 0, width: 1440, height: 900 }, crop.aspect);
    const cut = 1000;
    const bounds = sitePlanBounds(cut, 0, 60);
    const framing = wholeSiteFraming(bounds, { x: 720, y: 450 }, rect, WIND_SHEET_MARGIN);
    const plain = wholeSiteFraming(bounds, { x: 720, y: 450 }, rect);
    expect(framing.zoom).toBeLessThan(plain.zoom);

    const ratio = crop.minWidthPx / rect.width;
    const capture = { width: Math.round(crop.minWidthPx), height: Math.round(rect.height * ratio) };
    const metresAcross = rect.width / framing.zoom;
    const trim = cutMarginTrim(capture, metresAcross, { width: cut, height: cut }, WIND_SHEET_MARGIN)!;

    const pxPerMetre = capture.width / metresAcross;
    expect(trim.width).toBe(trim.height);
    expect((cut * pxPerMetre) / trim.width).toBeCloseTo(1 / (1 + 2 * WIND_SHEET_MARGIN), 2);
    expect(Math.abs(trim.x + trim.width / 2 - capture.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(trim.y + trim.height / 2 - capture.height / 2)).toBeLessThanOrEqual(1);
    expect(trim.x).toBeGreaterThanOrEqual(0);
    expect(trim.y).toBeGreaterThanOrEqual(0);
    expect(trim.x + trim.width).toBeLessThanOrEqual(capture.width);
    expect(trim.y + trim.height).toBeLessThanOrEqual(capture.height);

    const trimmed = trimmedFrame({ metresAcross, northRad: null }, capture.width, trim);
    expect(trimmed.metresAcross).toBeCloseTo(cut * (1 + 2 * WIND_SHEET_MARGIN), 0);
    expect(trim.width / trimmed.metresAcross).toBeCloseTo(pxPerMetre, 1);
  });

  it("returns no trim when the scale or cut size is unknown", () => {
    expect(cutMarginTrim({ width: 100, height: 100 }, 0, { width: 10, height: 10 }, 0.045)).toBeNull();
    expect(cutMarginTrim({ width: 100, height: 100 }, 10, { width: 0, height: 10 }, 0.045)).toBeNull();
  });
});
