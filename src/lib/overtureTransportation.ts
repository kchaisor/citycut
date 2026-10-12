import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { dedupeRoads } from "./footprints";
import { polylineLength } from "./geo";
import { overtureMaxRoadJumpM, sanitizeRoadFeatures } from "./roadLineValidation";
import { overtureTransportationUrl, resolveOvertureRelease } from "./overtureRelease";
import { clipLineToGroundVisible, hiddenSpansFromOvertureProps } from "./overtureSegmentVisibility";
import {
  roadSpecFromOvertureSegment,
  serviceKindOfSegment,
  skipTomTomSegmentWithoutClass,
} from "./overtureTransportMapping";
import {
  clipBoundsForTile,
  lineFromGeoJson,
  stableNumericId,
  tileLocalRect,
  tileRange,
} from "./overtureTiles";
import { clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE, type SiteFrameShape } from "./siteFrame";
import type { LonLat, Pt, RoadFeat } from "../types";
import { circleRing, detectRoundabouts, osmWayKey, type Roundabout } from "./roundabouts";

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
  service: string | null;
  /** OSM way key, used to reassemble roundabout rings cut into segments. */
  key: string | null;
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
  const hidden = (props: Record<string, unknown>) => hiddenSpansFromOvertureProps(props);
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
    const underground = hidden(props);
    const service = serviceKindOfSegment(props);
    const key = osmWayKey(props);
    for (const coordinates of lineStrings) {
      const clipped = lineFromGeoJson(coordinates, origin, half, tileRect);
      for (const line of clipped) {
        const visible = clipLineToGroundVisible(line, underground);
        for (const piece of visible) {
          if (polylineLength(piece) < 1) continue;
          parts.push({ id: `${id}:${x}:${y}:${parts.length}`, line: piece, spec, service, key });
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
  frameShape: SiteFrameShape = DEFAULT_SITE_FRAME_SHAPE,
): Promise<{ roads: RoadFeat[]; roadKm: number; roundabouts: Roundabout[]; stats: OvertureTransportStats }> {
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
  // Redraw each roundabout ring as one smooth closed centreline (fixed segment count).
  const roundabouts = detectRoundabouts(
    parts
      .filter((part) => part.spec.kind === "road" && part.spec.grade !== "path" && !part.service)
      .map((part) => ({ key: part.key, line: part.line, width: part.spec.width })),
  );
  if (roundabouts.length > 0) {
    const byKey = new Map(roundabouts.map((rb) => [rb.key, rb]));
    const firstOf = new Map<string, LinePart>();
    for (const part of parts) if (part.key && byKey.has(part.key) && !firstOf.has(part.key)) firstOf.set(part.key, part);
    const kept = parts.filter((part) => !(part.key && byKey.has(part.key)));
    for (const [key, part] of firstOf) {
      const rb = byKey.get(key)!;
      kept.push({ ...part, id: `${key}:roundabout`, line: circleRing(rb.center, rb.radius) });
    }
    parts.length = 0;
    parts.push(...kept);
  }
  const roads: RoadFeat[] = [];
  for (const part of parts) {
    for (const line of clipPolylineSiteFrame(part.line, sideM, frameShape)) {
      if (polylineLength(line) < 1) continue;
      roads.push({
        id: stableNumericId(`${part.id}:${roads.length}`),
        line,
        width: part.spec.width,
        kind: part.spec.kind,
        ...(part.spec.grade ? { grade: part.spec.grade } : {}),
        ...(part.service && part.spec.kind === "road" ? { service: part.service } : {}),
      });
    }
  }
  const jumpLimit = overtureMaxRoadJumpM(OVERTURE_TRANSPORT_ZOOM, origin);
  const sanitized = sanitizeRoadFeatures(roads, jumpLimit);
  const deduped = dedupeRoads(sanitized.roads);
  return {
    roads: deduped.roads,
    roundabouts,
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
