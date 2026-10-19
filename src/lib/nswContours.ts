import { clipPolyline } from "./clip";
import { polylineLength, toLocal } from "./geo";
import { queryArcgisLayer, type ArcgisFetch, type ArcgisResult } from "./arcgisQuery";
import { boundsTouchCityOfSydney, insideCityOfSydney } from "./region";
import {
  COS_ATTRIBUTION,
  COS_CONTOURS_DATASET_URL,
  NSW_LAYERS,
  NSW_SPATIAL_ATTRIBUTION,
  NSW_SPATIAL_DATASET_URL,
} from "./sources/nsw";
import { demContourLayer, inferContourInterval, type LonLatBounds } from "./vicmapContours";
import type { ContourLayer, LonLat, Pt, StoredContour, TerrainField } from "../types";

/**
 * NSW contours for one cut, best source first:
 *   1. City of Sydney 1 m Terrain contours where the cut touches the City of Sydney;
 *      NSW Elevation theme contours fill the part of the cut outside the City ("cos-nsw").
 *   2. NSW Spatial Services Elevation theme contours (2 m in Sydney) everywhere else ("nsw-2m").
 *   3. Contours traced from the Mapterhorn DEM ("dem").
 * Each failed or partial source leaves a note on the layer; nothing falls back silently.
 */

type Lines = { z: number; coordinates: number[][] }[];

function rawLines(result: ArcgisResult, field: string): Lines {
  const out: Lines = [];
  for (const feature of result.features) {
    const z = Number(feature.properties[field]);
    const g = feature.geometry;
    if (!g || !Number.isFinite(z)) continue;
    if (g.type === "LineString") out.push({ z, coordinates: g.coordinates });
    else if (g.type === "MultiLineString") for (const part of g.coordinates) out.push({ z, coordinates: part });
  }
  return out;
}

function dedupe(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of line) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.05) out.push(point);
  }
  return out;
}

/** Split lon/lat lines where `keep` changes, keeping runs of kept vertices. */
export function splitLinesWhere(lines: Lines, keep: (lon: number, lat: number) => boolean): Lines {
  const out: Lines = [];
  for (const line of lines) {
    let run: number[][] = [];
    for (const point of line.coordinates) {
      if (keep(point[0]!, point[1]!)) run.push(point);
      else {
        if (run.length >= 2) out.push({ z: line.z, coordinates: run });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ z: line.z, coordinates: run });
  }
  return out;
}

function toStored(lines: Lines, origin: LonLat, half: number): StoredContour[] {
  const out: StoredContour[] = [];
  for (const line of lines) {
    const local = line.coordinates.map(([lon, lat]) => toLocal(lat!, lon!, origin));
    for (const part of clipPolyline(dedupe(local), -half, half)) {
      const points = dedupe(part);
      if (points.length >= 2 && polylineLength(points) >= 0.5) out.push({ points, z: line.z });
    }
  }
  return out;
}

function noteFor(result: ArcgisResult): string | null {
  if (result.status === "ok") return null;
  return result.note;
}

export type NswContourOptions = {
  center: LonLat;
  sideM: number;
  bounds: LonLatBounds;
  signal?: AbortSignal;
  fetchImpl?: ArcgisFetch;
  timeoutMs?: number;
  terrain: () => Promise<TerrainField | null> | TerrainField | null;
};

export async function loadNswContoursForCut(options: NswContourOptions): Promise<ContourLayer | null> {
  const { center, sideM, bounds } = options;
  const half = sideM / 2;
  const notes: string[] = [];
  const query = { signal: options.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs };
  const started = Date.now();
  const touchesCos = boundsTouchCityOfSydney(bounds);
  const corners: [number, number][] = [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
  ];
  const allInsideCos = touchesCos && corners.every(([lon, lat]) => insideCityOfSydney(lon, lat));

  const [cos, nsw] = await Promise.all([
    touchesCos ? queryArcgisLayer(NSW_LAYERS.contoursCos, bounds, query) : Promise.resolve(null),
    allInsideCos ? Promise.resolve(null) : queryArcgisLayer(NSW_LAYERS.contours2m, bounds, query),
  ]);
  const fetchMs = Date.now() - started;
  const cosLines = cos ? toStored(rawLines(cos, "Contour"), center, half) : [];
  if (cos) {
    const note = noteFor(cos);
    if (note) notes.push(note);
    else if (cosLines.length === 0) notes.push("City of Sydney 1 m contours returned no lines in this cut.");
  }
  const nswRaw = nsw ? rawLines(nsw, "elevation") : [];
  if (nsw) {
    const note = noteFor(nsw);
    if (note) notes.push(note);
  }

  if (cosLines.length > 0) {
    const outside = touchesCos ? splitLinesWhere(nswRaw, (lon, lat) => !insideCityOfSydney(lon, lat)) : nswRaw;
    const fill = toStored(outside, center, half);
    const mixed = fill.length > 0;
    return {
      source: mixed ? "cos-nsw" : "cos-1m",
      label: mixed ? "City of Sydney 1 m contours, NSW contours outside the City" : "City of Sydney 1 m contours",
      interval: 1,
      lines: [...cosLines, ...fill],
      attribution: mixed
        ? `Terrain contours, ${COS_ATTRIBUTION}. Contours outside the City ${NSW_SPATIAL_ATTRIBUTION}, CC BY 4.0.`
        : `Terrain contours, ${COS_ATTRIBUTION}.`,
      datasetUrl: COS_CONTOURS_DATASET_URL,
      featureCount: (cos?.features.length ?? 0) + (mixed ? nsw?.features.length ?? 0 : 0),
      fetchMs,
      notes,
    };
  }

  const nswLines = toStored(nswRaw, center, half);
  if (nswLines.length > 0) {
    const interval = inferContourInterval(nswLines.map((line) => line.z), 2);
    if (touchesCos) notes.push("City of Sydney 1 m contours did not load, so NSW contours are used across the cut.");
    return {
      source: "nsw-2m",
      label: `NSW Elevation ${interval} m contours`,
      interval,
      lines: nswLines,
      attribution: `Contours ${NSW_SPATIAL_ATTRIBUTION}, CC BY 4.0.`,
      datasetUrl: NSW_SPATIAL_DATASET_URL,
      featureCount: nsw?.features.length ?? 0,
      fetchMs,
      notes,
    };
  }
  if (nsw && nsw.status === "ok" && nswLines.length === 0) notes.push("NSW contours returned no lines in this cut.");

  const field = await options.terrain();
  if (!field) return null;
  return { ...demContourLayer(field, sideM), notes: [...notes, "Contours are traced from the Mapterhorn DEM because no NSW contours loaded."] };
}
