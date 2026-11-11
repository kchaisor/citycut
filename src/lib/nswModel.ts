import type { NswBuildingComplex, NswLayers } from "./nswLayers";
import { NSW_BUILDING_ESTIMATE_NOTE, regionCredit } from "./sources/registry";
import type { AreaFeat, BuildingFeat, Pt } from "../types";

export const NSW_WATER_ID_BASE = 9_000_000;

export function nswWaterAreas(base: AreaFeat[], nsw: NswLayers | null): { areas: AreaFeat[]; note: string | null } {
  if (!nsw) return { areas: base, note: "NSW layers did not load; water is from Overture Maps." };
  const status = nsw.status.water;
  if (status.status === "failed") {
    return { areas: base, note: `NSW water (HydroArea) failed, so water is from Overture Maps. ${status.note ?? ""}`.trim() };
  }
  const water: AreaFeat[] = nsw.water.map((poly, index) => ({
    id: NSW_WATER_ID_BASE + index,
    ring: poly.outer,
    holes: poly.holes,
    kind: "water",
  }));
  const areas = [...base.filter((area) => area.kind !== "water"), ...water];
  return { areas, note: status.status === "partial" ? status.note : null };
}

export const NSW_DATUM_NOTE =
  "Spatial Services layers come from the multiCRS services in GDA2020 (server GDA94→GDA2020 NTv2 conformal + distortion grid, EPSG:8446). Planning layers and City of Sydney contours are GDA94 and are converted in CityCut with the EPSG:8048 7-parameter transformation (within 34 mm of the grid at Pyrmont). GDA2020 is used as WGS84.";

export function nswSourceNote(nsw: NswLayers | null): string {
  const parts = [`NSW mode. ${regionCredit("nsw")}.`, NSW_BUILDING_ESTIMATE_NOTE, NSW_DATUM_NOTE];
  if (!nsw) parts.push("NSW layers did not load.");
  else for (const layer of Object.values(nsw.status)) if (layer.status !== "ok" && layer.note) parts.push(layer.note);
  return parts.join(" ");
}

function ringContains(ring: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringDistance(ring: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j]!;
    const [bx, by] = ring[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

export const NSW_COMPLEX_SNAP_M = 8;

export function nswApplyBuildingUse(buildings: BuildingFeat[], nsw: NswLayers | null): { buildings: BuildingFeat[]; matched: number } {
  const complexes = nsw?.buildingComplexes ?? [];
  if (complexes.length === 0 || buildings.length === 0) return { buildings, matched: 0 };
  const assigned = new Map<number, NswBuildingComplex>();
  for (const complex of complexes) {
    if (complex.use === "unclassified") continue;
    const [x, y] = complex.at;
    let index = buildings.findIndex((b) => ringContains(b.ring, x, y) && !b.holes.some((h) => ringContains(h, x, y)));
    if (index < 0) {
      let best = NSW_COMPLEX_SNAP_M;
      buildings.forEach((b, i) => {
        const d = ringDistance(b.ring, x, y);
        if (d <= best) {
          best = d;
          index = i;
        }
      });
    }
    if (index >= 0 && !assigned.has(index)) assigned.set(index, complex);
  }
  if (assigned.size === 0) return { buildings, matched: 0 };
  const next = buildings.map((building, index) => {
    const complex = assigned.get(index);
    if (!complex) return building;
    const what = [complex.type || complex.facility, complex.name].filter(Boolean).join(", ");
    return { ...building, use: complex.use, nswFacility: what };
  });
  return { buildings: next, matched: assigned.size };
}

export function nswLightRailLines(nsw: NswLayers | null): Pt[][] {
  return (nsw?.railways ?? []).filter((rail) => rail.kind === "light" && rail.operational && !rail.tunnel).map((rail) => rail.line);
}
