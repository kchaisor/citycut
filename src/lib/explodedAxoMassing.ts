import { clipAreaToSiteFrame, DEFAULT_SITE_FRAME_SHAPE, type SiteFrameShape } from "./siteFrame";
import { openRing, signedArea } from "./geo";
import { getColour } from "./colours";
import type { BuildingFeat, BuildingHeightTier, CityModel, Pt } from "../types";

/** One filled face of an extruded solid, in iso base coords (lift 0 = plate). */
export type AxoSolidFace = {
  /** Closed iso SVG path (M/L/Z, y down). */
  d: string;
  paint:
    | "building-roof"
    | "building-wall-light"
    | "building-wall-dark"
    | "tree-canopy"
    | "tree-canopy-shade"
    | "tree-trunk";
  /** Explicit fill overriding `paint` (imported massing in its per-model colour). */
  fill?: string;
};

/** Scale a #RRGGBB colour toward black (wall shading for imported massing). */
export function shadeHex(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((value >> shift) & 255) * factor).toString(16).padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

const COS30 = Math.sqrt(3) / 2;
const round = (v: number) => Math.round(v * 100) / 100;

function iso(east: number, north: number, upM: number): Pt {
  return [(east - north) * COS30, (east + north) * 0.5 - upM];
}

function pathOf(points: Pt[]): string {
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p[0])} ${round(p[1])}`).join(" ")} Z`;
}

/** Plan depth toward the viewer: larger = nearer (lower on screen). */
export function axoPlanDepth(east: number, north: number): number {
  return east + north;
}

/** Height source groups, in the priority order used for the axo note. */
export type AxoHeightSource = "com" | "dam" | "overture_osm" | "estimate";

export function axoHeightSource(tier: BuildingHeightTier | undefined, fallback?: boolean): AxoHeightSource {
  if (tier === "com" || tier === "lidar" || tier === "manual") return "com";
  if (tier === "development_floors") return "dam";
  if (tier === "overture_height" || tier === "overture_floors" || tier === "osm_levels") return "overture_osm";
  if (tier === "zone_default" || tier === "real_source_unmatched") return "estimate";
  return fallback ? "estimate" : "overture_osm";
}

type Prism = { outer: Pt[]; holes: Pt[][]; base: number; top: number; depth: number; fill?: string };

function prismsFor(building: BuildingFeat, sideM: number, shape: SiteFrameShape): Prism[] {
  const parts = building.extrusionParts?.length
    ? building.extrusionParts.map((p) => ({ ring: p.ring, holes: p.holes, height: p.height, base: p.base ?? 0 }))
    : [{ ring: building.ring, holes: building.holes, height: building.height, base: 0 }];
  const out: Prism[] = [];
  for (const part of parts) {
    if (!(part.height > part.base)) continue;
    const clipped = clipAreaToSiteFrame(part.ring as Pt[], part.holes as Pt[][], sideM, shape);
    if (!clipped || clipped.length === 0) continue;
    const outer = openRing(clipped[0]!);
    if (outer.length < 3) continue;
    let depth = -Infinity;
    for (const [e, n] of outer) depth = Math.max(depth, axoPlanDepth(e, n));
    out.push({ outer, holes: clipped.slice(1).map((h) => openRing(h)), base: part.base, top: part.height, depth });
  }
  return out;
}

/**
 * Extruded massing faces in painter's order (far → near). Walls facing the viewer
 * get one of two shades by orientation; roofs draw last per prism.
 * `heightScale` lets the stack exaggerate or compress heights (1 = true metres).
 */
export function buildAxoMassingFaces(
  model: CityModel,
  heightScale = 1,
): { faces: AxoSolidFace[]; counts: Record<AxoHeightSource, number> } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const counts: Record<AxoHeightSource, number> = { com: 0, dam: 0, overture_osm: 0, estimate: 0 };
  const prisms: Prism[] = [];
  for (const building of model.buildings) {
    if (building.meshDrawnBy != null) continue;
    const list = prismsFor(building, model.sideM, shape);
    if (list.length === 0) continue;
    counts[axoHeightSource(building.heightTier, building.heightFromFallback)] += 1;
    const fill = building.importedMassing ? (building.importedColour ?? getColour("--imported-massing")) : undefined;
    prisms.push(...(fill ? list.map((p) => ({ ...p, fill })) : list));
  }
  prisms.sort((a, b) => a.depth - b.depth || a.top - b.top);
  const faces: AxoSolidFace[] = [];
  for (const prism of prisms) {
    const base = prism.base * heightScale;
    const top = prism.top * heightScale;
    const rings = [prism.outer, ...prism.holes];
    const walls: { d: string; paint: AxoSolidFace["paint"]; depth: number }[] = [];
    rings.forEach((ring, ringIndex) => {
      // Solid lies inside the outer ring and outside each hole.
      const ccw = (signedArea(ring) > 0) === (ringIndex === 0);
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        // Outward normal of a CCW ring edge is (dy, -dx); flip for CW rings.
        const nx = ccw ? dy : -dy;
        const ny = ccw ? -dx : dx;
        // Viewer looks from +east/+north toward the plate (screen bottom).
        if (nx + ny <= 1e-9) continue;
        walls.push({
          d: pathOf([iso(a[0], a[1], base), iso(b[0], b[1], base), iso(b[0], b[1], top), iso(a[0], a[1], top)]),
          paint: nx >= ny ? "building-wall-light" : "building-wall-dark",
          depth: axoPlanDepth((a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
        });
      }
    });
    walls.sort((p, q) => p.depth - q.depth);
    for (const wall of walls) {
      faces.push(
        prism.fill
          ? { d: wall.d, paint: wall.paint, fill: shadeHex(prism.fill, wall.paint === "building-wall-light" ? 0.86 : 0.72) }
          : { d: wall.d, paint: wall.paint },
      );
    }
    const roof = rings.map((ring) => pathOf(ring.map(([e, n]) => iso(e, n, top)))).join(" ");
    faces.push(prism.fill ? { d: roof, paint: "building-roof", fill: prism.fill } : { d: roof, paint: "building-roof" });
  }
  return { faces, counts };
}

/** Short visible note naming the height sources; defaults are called estimates. */
export function axoMassingHeightNote(counts: Record<AxoHeightSource, number>): string {
  const parts: string[] = [];
  if (counts.com) parts.push(`CoM 2023 ${counts.com}`);
  if (counts.dam) parts.push(`DAM floors ${counts.dam}`);
  if (counts.overture_osm) parts.push(`Overture/OSM ${counts.overture_osm}`);
  if (counts.estimate) parts.push(`default estimate ${counts.estimate}`);
  return parts.length ? `Heights: ${parts.join(" · ")}` : "";
}
