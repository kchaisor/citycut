import { toLocal } from "../geo";
import { clipAreaToSiteFrame, type FrameGroundSize, type SiteFrameShape } from "../siteFrame";
import { openRing } from "../geo";
import type { LonLat, Pt, Ring } from "../../types";
import type {
  StoredSiteFootprint,
  StoredSiteFootprintProps,
  StoredSiteFootprintRole,
  StoredSiteStructureOutline,
} from "./types";

type GeoRing = number[][];

function ringFromGeo(coords: GeoRing, origin: LonLat): Ring | null {
  if (coords.length < 4) return null;
  const ring: Pt[] = [];
  for (const pair of coords) {
    const lon = pair[0];
    const lat = pair[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    ring.push(toLocal(lat, lon, origin));
  }
  return openRing(ring);
}

function parseRole(value: unknown): StoredSiteFootprintRole | null {
  if (value === "building" || value === "slab" || value === "structure") return value;
  return null;
}

export function parseStoredSiteFootprints(
  collection: unknown,
  origin: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
  frameSize?: FrameGroundSize,
): { footprints: StoredSiteFootprint[]; structures: StoredSiteStructureOutline[] } {
  const footprints: StoredSiteFootprint[] = [];
  const structures: StoredSiteStructureOutline[] = [];
  if (!collection || typeof collection !== "object") return { footprints, structures };
  const features = (collection as { features?: unknown[] }).features;
  if (!Array.isArray(features)) return { footprints, structures };
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const entry = feature as {
      id?: string;
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: GeoRing[] };
    };
    const props = entry.properties ?? {};
    const id = typeof props.id === "string" ? props.id : typeof entry.id === "string" ? entry.id : null;
    const role = parseRole(props.role);
    const baseZ = typeof props.baseZ === "number" ? props.baseZ : NaN;
    const topZ = typeof props.topZ === "number" ? props.topZ : NaN;
    const layer = typeof props.layer === "string" ? props.layer : "";
    if (!id || !role || !Number.isFinite(baseZ) || !Number.isFinite(topZ)) continue;
    if (entry.geometry?.type !== "Polygon" || !entry.geometry.coordinates?.[0]) continue;
    const ring = ringFromGeo(entry.geometry.coordinates[0], origin);
    if (!ring || ring.length < 3) continue;
    const holes = (entry.geometry.coordinates.slice(1) ?? [])
      .map((coords) => ringFromGeo(coords, origin))
      .filter((hole): hole is Ring => hole != null && hole.length >= 3);
    const clipped = clipAreaToSiteFrame(ring, holes, sideM, frameShape, frameSize);
    if (!clipped || clipped.length === 0) continue;
    const outer = clipped[0]!;
    const clippedHoles = clipped.slice(1);
    const itemProps: StoredSiteFootprintProps = { id, layer, baseZ, topZ, role };
    if (role === "structure") {
      structures.push({ id, ring: outer, holes: clippedHoles });
      continue;
    }
    if (role === "slab") {
      footprints.push({ id, ring: outer, holes: clippedHoles, props: itemProps });
      continue;
    }
    footprints.push({ id, ring: outer, holes: clippedHoles, props: itemProps });
  }
  return { footprints, structures };
}
