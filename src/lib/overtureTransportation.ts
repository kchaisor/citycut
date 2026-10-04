import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { dedupeRoads } from "./footprints";
import { polylineLength } from "./geo";
import { overtureTransportationUrl, resolveOvertureRelease } from "./overtureRelease";
import { roadSpecFromOvertureSegment, skipTomTomSegmentWithoutClass } from "./overtureTransportMapping";
import {
  clipBoundsForTile,
  lineFromGeoJson,
  stableNumericId,
  tileLocalRect,
  tileRange,
} from "./overtureTiles";
import type { LonLat, Pt, RoadFeat } from "../types";

export const OVERTURE_TRANSPORT_ZOOM = 14;

export type OvertureTransportStats = {
  release: string;
  tileCount: number;
  fetchMs: number;
  segmentCount: number;
  skippedTomTom: number;
};

type LinePart = { id: string; line: Pt[]; spec: NonNullable<ReturnType<typeof roadSpecFromOvertureSegment>> };

function partsFromTile(
  data: ArrayBuffer,
  z: number,
  x: number,
  y: number,
  origin: LonLat,
  half: number,
): { parts: LinePart[]; skippedTomTom: number } {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers.segment;
  if (!layer) return { parts: [], skippedTomTom: 0 };
  const tileRect = clipBoundsForTile(half, tileLocalRect(z, x, y, origin));
  const parts: LinePart[] = [];
  let skippedTomTom = 0;
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties as Record<string, unknown>;
    if (skipTomTomSegmentWithoutClass(props)) {
      skippedTomTom += 1;
      continue;
    }
    const spec = roadSpecFromOvertureSegment(props);
    if (!spec) continue;
    const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
    if (!id) continue;
    const geo = feature.toGeoJSON(x, y, z);
    if (geo.geometry.type !== "LineString") continue;
    const clipped = lineFromGeoJson(geo.geometry.coordinates, origin, half, tileRect);
    for (const line of clipped) {
      if (polylineLength(line) < 1) continue;
      parts.push({ id, line, spec });
    }
  }
  return { parts, skippedTomTom };
}

export async function fetchOvertureTransportationForCut(
  bounds: { south: number; west: number; north: number; east: number },
  origin: LonLat,
  sideM: number,
  signal?: AbortSignal,
): Promise<{ roads: RoadFeat[]; roadKm: number; stats: OvertureTransportStats }> {
  const half = sideM / 2;
  const t0 = performance.now();
  const release = await resolveOvertureRelease(signal);
  const pmtiles = new PMTiles(overtureTransportationUrl(release));
  const tiles = tileRange(bounds, OVERTURE_TRANSPORT_ZOOM);
  let skippedTomTom = 0;
  let segmentCount = 0;
  const parts: LinePart[] = [];
  for (const { z, x, y } of tiles) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const tile = await pmtiles.getZxy(z, x, y, signal);
    if (!tile?.data) continue;
    const fromTile = partsFromTile(tile.data, z, x, y, origin, half);
    skippedTomTom += fromTile.skippedTomTom;
    segmentCount += fromTile.parts.length;
    parts.push(...fromTile.parts);
  }
  const roads: RoadFeat[] = parts.map((part) => ({
    id: stableNumericId(part.id),
    line: part.line,
    width: part.spec.width,
    kind: part.spec.kind,
    ...(part.spec.grade ? { grade: part.spec.grade } : {}),
  }));
  const deduped = dedupeRoads(roads);
  return {
    roads: deduped.roads,
    roadKm: deduped.metres / 1000,
    stats: {
      release,
      tileCount: tiles.length,
      fetchMs: performance.now() - t0,
      segmentCount,
      skippedTomTom,
    },
  };
}
