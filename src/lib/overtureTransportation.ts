import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { dedupeRoads } from "./footprints";
import { polylineLength, toLocal } from "./geo";
import { overtureMaxRoadJumpM, sanitizeRoadFeatures } from "./roadLineValidation";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";
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

/** A whole street segment (not frame-clipped) from an OSM way, for fitting roundabout rings. */
type RingCandidate = { key: string; line: Pt[]; width: number };

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
): { parts: LinePart[]; skippedTomTom: number; ringCandidates: RingCandidate[] } {
  const vt = new VectorTile(new PbfReader(data));
  const layer = vt.layers.segment;
  if (!layer) return { parts: [], skippedTomTom: 0, ringCandidates: [] };
  const tileRect = clipBoundsForTile(half, tileLocalRect(z, x, y, origin));
  const parts: LinePart[] = [];
  const ringCandidates: RingCandidate[] = [];
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
    const street = spec.kind === "road" && spec.grade !== "path" && !service;
    for (const coordinates of lineStrings) {
      if (key && street) {
        ringCandidates.push({ key, width: spec.width, line: coordinates.map(([lon, lat]) => toLocal(lat, lon, origin)) });
      }
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
  return { parts, skippedTomTom, ringCandidates };
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
  const pmtiles = new PMTiles(new EnrichmentPmtilesSource(overtureTransportationUrl(release)));
  const tiles = tileRange(bounds, OVERTURE_TRANSPORT_ZOOM);
  let skippedTomTom = 0;
  let segmentCount = 0;
  const parts: LinePart[] = [];
  const ringCandidates: RingCandidate[] = [];
  for (const { z, x, y } of tiles) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const tile = await pmtiles.getZxy(z, x, y, signal);
    if (!tile?.data) continue;
    const fromTile = partsFromTile(tile.data, z, x, y, origin, half);
    skippedTomTom += fromTile.skippedTomTom;
    segmentCount += fromTile.parts.length;
    parts.push(...fromTile.parts);
    ringCandidates.push(...fromTile.ringCandidates);
  }
  // Redraw each roundabout ring as one smooth closed centreline (fixed segment count).
  // Fitted on whole segments, so a ring the frame cuts is still found; only rings near the frame
  // matter (a candidate must reach within one radius of it).
  const roundabouts = detectRoundabouts(ringCandidates).filter(
    (rb) => Math.abs(rb.center[0]) - rb.radius <= half && Math.abs(rb.center[1]) - rb.radius <= half,
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
