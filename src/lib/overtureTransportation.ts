import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { dedupeRoads } from "./footprints";
import { polylineLength } from "./geo";
import { overtureMaxRoadJumpM, sanitizeRoadFeatures } from "./roadLineValidation";
import { overtureTransportationUrl, resolveOvertureRelease } from "./overtureRelease";
import {
  clipLineToGroundVisible,
  clipLineToVisibleSpans,
  elevatedSpansFromOvertureProps,
  groundHiddenSpansFromOvertureProps,
} from "./overtureSegmentVisibility";
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

type LinePart = {
  id: string;
  line: Pt[];
  spec: NonNullable<ReturnType<typeof roadSpecFromOvertureSegment>>;
  deck?: boolean;
};

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
  const groundHidden = (props: Record<string, unknown>) => groundHiddenSpansFromOvertureProps(props);
  const elevated = (props: Record<string, unknown>) => elevatedSpansFromOvertureProps(props);
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
    const lineStrings =
      geo.geometry.type === "LineString"
        ? [geo.geometry.coordinates]
        : geo.geometry.type === "MultiLineString"
          ? geo.geometry.coordinates
          : [];
    const offGround = groundHidden(props);
    const deckSpans = elevated(props);
    for (const coordinates of lineStrings) {
      const clipped = lineFromGeoJson(coordinates, origin, half, tileRect);
      for (const line of clipped) {
        const visible = clipLineToGroundVisible(line, offGround);
        for (const piece of visible) {
          if (polylineLength(piece) < 1) continue;
          parts.push({ id: `${id}:${x}:${y}:${parts.length}`, line: piece, spec });
        }
        for (const piece of clipLineToVisibleSpans(line, deckSpans)) {
          if (polylineLength(piece) < 1) continue;
          parts.push({ id: `${id}:${x}:${y}:deck:${parts.length}`, line: piece, spec, deck: true });
        }
      }
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
    ...(part.deck ? { deck: true } : {}),
  }));
  const jumpLimit = overtureMaxRoadJumpM(OVERTURE_TRANSPORT_ZOOM, origin);
  const sanitized = sanitizeRoadFeatures(roads, jumpLimit);
  const deduped = dedupeRoads(sanitized.roads);
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
