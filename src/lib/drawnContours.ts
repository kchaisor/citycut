import { clipPolyline } from "./clip";
import { contourTerrain, PINNABLE_CONTOUR_SOURCES } from "./contourTerrain";
import { fromLocal } from "./geo";
import { insideCityOfSydney } from "./region";
import { contourLevels, DRAWN_CONTOUR_INTERVAL_M, leveledContourLines } from "./terrain";
import { altitudeOnInterval, demContourLayer } from "./vicmapContours";
import type { CityModel, ContourLayer, Pt, StoredContour, TerrainField } from "../types";

export const NSW_OFFICIAL_CONTOUR_INTERVAL_M = 2;

export type InterpolateOptions = {
  officialIntervalM?: number;
  keep?: (point: Pt) => boolean;
};

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

function splitWhere(line: Pt[], keep: (point: Pt) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let run: Pt[] = [];
  for (const point of line) {
    if (keep(point)) run.push(point);
    else {
      if (run.length >= 2) out.push(run);
      run = [];
    }
  }
  if (run.length >= 2) out.push(run);
  return out;
}

export function interpolatedContourLines(
  field: TerrainField,
  sideM: number,
  officialIntervalM: number,
  keep?: (point: Pt) => boolean,
): StoredContour[] {
  const levels = contourLevels(field.min, field.max, DRAWN_CONTOUR_INTERVAL_M).filter(
    (level) => !altitudeOnInterval(level, officialIntervalM),
  );
  if (levels.length === 0) return [];
  const half = sideM / 2;
  const out: StoredContour[] = [];
  for (const item of leveledContourLines(field, sideM, DRAWN_CONTOUR_INTERVAL_M, levels)) {
    for (const part of clipPolyline(dedupe(item.line), -half, half)) {
      for (const run of keep ? splitWhere(part, keep) : [part]) {
        const points = dedupe(run);
        if (points.length >= 2) out.push({ points, z: item.z });
      }
    }
  }
  return out;
}

const drawnLayers = new WeakMap<ContourLayer, WeakMap<object, ContourLayer>>();
const NO_FIELD = {};

export function withInterpolatedContours(
  layer: ContourLayer,
  field: TerrainField | null,
  sideM: number,
  options: InterpolateOptions = {},
): ContourLayer {
  const officialIntervalM = options.officialIntervalM ?? layer.interval;
  if (!(officialIntervalM > DRAWN_CONTOUR_INTERVAL_M)) return layer;
  const byField = drawnLayers.get(layer) ?? new WeakMap<object, ContourLayer>();
  drawnLayers.set(layer, byField);
  const key = field ?? NO_FIELD;
  const cached = byField.get(key);
  if (cached) return cached;
  const surface =
    field ?? (PINNABLE_CONTOUR_SOURCES.has(layer.source) ? (contourTerrain(layer, sideM, null)?.field ?? null) : null);
  const infill = surface ? interpolatedContourLines(surface, sideM, officialIntervalM, options.keep) : [];
  const drawn: ContourLayer = infill.length
    ? { ...layer, interval: DRAWN_CONTOUR_INTERVAL_M, lines: [...layer.lines, ...infill] }
    : layer;
  byField.set(key, drawn);
  return drawn;
}

export function drawnContourLayer(
  model: Pick<CityModel, "contours" | "contourLayer" | "terrain" | "sideM" | "center">,
): ContourLayer | null {
  if (model.contours === false) return null;
  if (model.contourLayer) {
    const layer = model.contourLayer;
    const field = model.terrain ?? null;
    if (layer.source === "cos-nsw") {
      return withInterpolatedContours(layer, field, model.sideM, {
        officialIntervalM: NSW_OFFICIAL_CONTOUR_INTERVAL_M,
        keep: (point) => {
          const at = fromLocal(point, model.center);
          return !insideCityOfSydney(at.lon, at.lat);
        },
      });
    }
    return withInterpolatedContours(layer, field, model.sideM);
  }
  return model.contours && model.terrain ? demContourLayer(model.terrain, model.sideM) : null;
}
