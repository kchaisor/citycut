import type { MultiPolygon, Polygon } from "./safePolygonClip";
import { clipUnion } from "./safePolygonClip";
import RBush from "rbush";
import { fromLocal, openRing, toLocal } from "./geo";
import { pointInPolygon } from "./useCascade";
import type { LonLat, Pt } from "../types";
import type { IndexedParcel, ParcelOutline } from "./parcelOutlines";

function parcelToLocalPolygon(parcel: ParcelOutline, origin: LonLat): Polygon {
  const ring = openRing(parcel.ring.map(([lon, lat]) => toLocal(lat, lon, origin)));
  if (ring.length < 3) return [[[0, 0], [0, 0], [0, 0]]];
  const closed = ring.map(([e, n]) => [e, n] as [number, number]);
  closed.push(closed[0]!);
  return [closed];
}

export function unionParcelsLocal(parcels: ParcelOutline[], origin: LonLat): MultiPolygon {
  if (parcels.length === 0) return [];
  let merged: MultiPolygon = [];
  for (const parcel of parcels) {
    const poly = parcelToLocalPolygon(parcel, origin);
    merged = merged.length ? clipUnion(merged, poly) : [poly];
  }
  return merged;
}

export function pointInLocalMulti(point: Pt, multi: MultiPolygon): boolean {
  for (const polygon of multi) {
    const outer = (polygon[0] ?? []).map(([x, y]) => [x, y] as Pt);
    const holes = polygon.slice(1).map((hole) => hole.map(([x, y]) => [x, y] as Pt));
    if (outer.length >= 3 && pointInPolygon(point, outer, holes)) return true;
  }
  return false;
}

export function pickParcelAt(
  index: RBush<IndexedParcel>,
  east: number,
  north: number,
  origin: LonLat,
): string | null {
  const { lon, lat } = fromLocal([east, north], origin);
  const pad = 0.00008;
  const hits = index.search({
    minX: lon - pad,
    minY: lat - pad,
    maxX: lon + pad,
    maxY: lat + pad,
  });
  let best: { id: string; area: number } | null = null;
  for (const hit of hits) {
    const localRing = openRing(hit.ring.map(([lo, la]: [number, number]) => toLocal(la, lo, origin)));
    if (!pointInPolygon([east, north], localRing, [])) continue;
    let area = 0;
    for (let i = 0; i < localRing.length; i++) {
      const a = localRing[i]!;
      const b = localRing[(i + 1) % localRing.length]!;
      area += a[0] * b[1] - b[0] * a[1];
    }
    area = Math.abs(area / 2);
    if (!best || area < best.area) best = { id: hit.id, area };
  }
  return best?.id ?? null;
}

export function samplePointInsideParcelLocal(parcel: ParcelOutline, origin: LonLat): [number, number] | null {
  const local = openRing(parcel.ring.map(([lon, lat]) => toLocal(lat, lon, origin)));
  if (local.length < 3) return null;
  const holes: Pt[][] = [];
  let cx = 0;
  let cy = 0;
  for (const [e, n] of local) {
    cx += e;
    cy += n;
  }
  const nVerts = local.length;
  cx /= nVerts;
  cy /= nVerts;
  if (pointInPolygon([cx, cy], local, holes)) return [cx, cy];
  const offsetsM = [0.5, 1, 2, 4, 8, 14];
  for (let i = 0; i < local.length; i++) {
    const a = local[i]!;
    const b = local[(i + 1) % local.length]!;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    for (const off of offsetsM) {
      for (const sign of [-1, 1] as const) {
        const ex = mx + px * off * sign;
        const ey = my + py * off * sign;
        if (pointInPolygon([ex, ey], local, holes)) return [ex, ey];
      }
    }
  }
  return null;
}

export function nearestParcelIds(
  parcels: ParcelOutline[],
  origin: LonLat,
  count: number,
): string[] {
  const ranked = parcels
    .map((parcel) => {
      const local = openRing(parcel.ring.map(([lon, lat]) => toLocal(lat, lon, origin)));
      let cx = 0;
      let cy = 0;
      for (const [e, n] of local) {
        cx += e;
        cy += n;
      }
      const n = local.length || 1;
      cx /= n;
      cy /= n;
      return { id: parcel.id, dist: Math.hypot(cx, cy) };
    })
    .sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, count).map((row) => row.id);
}
