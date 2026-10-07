import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { toLocal } from "./geo";
import { tileRange } from "./overtureTiles";
import { ptModeFromValue, type PublicTransportLine, type PublicTransportStop } from "./explodedAxoOverlayFetch";
import { clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE, pointInSiteFrame, type SiteFrameShape } from "./siteFrame";
import type { CityModel, LonLat, Pt } from "../types";

/** Greater Melbourne extent for the pre-tiled PT dataset. */
export const PT_METRO_BOUNDS = {
  south: -38.25,
  west: 144.35,
  north: -37.45,
  east: 145.55,
};

export const PT_LINES_PMTILES_URL = `${import.meta.env.BASE_URL}pt-metro-lines.pmtiles`;
export const PT_STOPS_PMTILES_URL = `${import.meta.env.BASE_URL}pt-metro-stops.pmtiles`;

function resolveUrl(relative: string): string {
  const base =
    typeof document !== "undefined" && document.baseURI
      ? document.baseURI
      : typeof location !== "undefined"
        ? `${location.origin}${import.meta.env.BASE_URL}`
        : import.meta.env.BASE_URL;
  return new URL(relative, base).href;
}

function linesFromVectorFeature(
  feature: { toGeoJSON: (x: number, y: number, z: number) => GeoJSON.Feature },
  x: number,
  y: number,
  z: number,
  origin: LonLat,
): Pt[][] {
  const geo = feature.toGeoJSON(x, y, z);
  const geometry = geo.geometry;
  if (!geometry || geometry.type === "GeometryCollection") return [];
  const parts =
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
        ? geometry.coordinates
        : geometry.type === "Point"
          ? [[geometry.coordinates]]
          : [];
  const lines: Pt[][] = [];
  for (const part of parts) {
    if (!Array.isArray(part)) continue;
    const line: Pt[] = [];
    for (const coord of part) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const lon = Number(coord[0]);
      const lat = Number(coord[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      line.push(toLocal(lat, lon, origin));
    }
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

function pointFromVectorFeature(
  feature: { toGeoJSON: (x: number, y: number, z: number) => GeoJSON.Feature },
  x: number,
  y: number,
  z: number,
  origin: LonLat,
): Pt | null {
  const geo = feature.toGeoJSON(x, y, z);
  const geometry = geo.geometry;
  if (!geometry || geometry.type !== "Point") return null;
  const coord = geometry.coordinates;
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const lon = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return toLocal(lat, lon, origin);
}

function zoomLevelsForArchive(header: { minZoom: number; maxZoom: number }): number[] {
  const levels = new Set<number>();
  for (let z = header.maxZoom; z >= header.minZoom && levels.size < 3; z--) levels.add(z);
  return [...levels];
}

async function readPmtilesLayer<T>(
  url: string,
  bounds: { south: number; west: number; north: number; east: number },
  preferredLayerNames: string[],
  sideM: number,
  frameShape: SiteFrameShape,
  origin: LonLat,
  signal: AbortSignal | undefined,
  mapFeature: (props: Record<string, unknown>, localLines: Pt[][]) => T[],
  mapPoint?: (props: Record<string, unknown>, point: Pt) => T[],
): Promise<T[]> {
  const pmtiles = new PMTiles(resolveUrl(url));
  const header = await pmtiles.getHeader();
  const zooms = zoomLevelsForArchive(header);
  const out: T[] = [];
  const seen = new Set<string>();

  for (const z of zooms) {
    for (const { x, y } of tileRange(bounds, z)) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const tile = await pmtiles.getZxy(z, x, y, signal);
      if (!tile?.data) continue;
      const vt = new VectorTile(new PbfReader(tile.data));
      const layerName =
        preferredLayerNames.find((name) => vt.layers[name]) ?? Object.keys(vt.layers)[0];
      if (!layerName) continue;
      const layer = vt.layers[layerName];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        const props = feature.properties as Record<string, unknown>;
        const dedupeKey = `${z}:${x}:${y}:${i}:${JSON.stringify(props)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        if (mapPoint) {
          const point = pointFromVectorFeature(feature, x, y, z, origin);
          if (!point || !pointInSiteFrame(point, sideM, frameShape)) continue;
          out.push(...mapPoint(props, point));
          continue;
        }
        const rawLines = linesFromVectorFeature(feature, x, y, z, origin);
        const clipped: Pt[][] = [];
        for (const line of rawLines) {
          for (const part of clipPolylineSiteFrame(line, sideM, frameShape)) {
            if (part.length >= 2) clipped.push(part);
          }
        }
        if (clipped.length === 0) continue;
        out.push(...mapFeature(props, clipped));
      }
    }
  }
  return out;
}

/** Metro tram centre lines clipped to the cut (PTV PMTiles, MODE METRO TRAM). */
export async function fetchTramLinesForCut(
  model: CityModel,
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<Pt[][] | null> {
  const overlays = await fetchPublicTransportOverlays(model, bounds, signal);
  if (!overlays) return null;
  const lines = overlays.lines.filter((line) => line.mode === "tram").map((line) => line.line);
  return lines.length > 0 ? lines : null;
}

export async function fetchPublicTransportOverlays(
  model: CityModel,
  bounds: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal,
): Promise<{ lines: PublicTransportLine[]; stops: PublicTransportStop[] } | null> {
  if (
    bounds.north < PT_METRO_BOUNDS.south ||
    bounds.south > PT_METRO_BOUNDS.north ||
    bounds.east < PT_METRO_BOUNDS.west ||
    bounds.west > PT_METRO_BOUNDS.east
  ) {
    return null;
  }
  try {
    const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
    const [lines, stops] = await Promise.all([
      readPmtilesLayer(
        PT_LINES_PMTILES_URL,
        bounds,
        ["lines", "geojsonLayer"],
        model.sideM,
        shape,
        model.center,
        signal,
        (props, clipped) => {
          const mode = ptModeFromValue(props.MODE ?? props.mode);
          return clipped.map((line) => ({ mode, line }));
        },
      ),
      readPmtilesLayer(
        PT_STOPS_PMTILES_URL,
        bounds,
        ["stops", "geojsonLayer"],
        model.sideM,
        shape,
        model.center,
        signal,
        () => [],
        (props, point) => [{ mode: ptModeFromValue(props.MODE ?? props.mode), point }],
      ),
    ]);
    if (lines.length === 0 && stops.length === 0) return null;
    return { lines, stops };
  } catch {
    return null;
  }
}
