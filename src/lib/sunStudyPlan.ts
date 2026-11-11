import { sunAtMelbourneLocal } from "./solar";
import { buildingHeightsFingerprint } from "./heightOverrides";
import { inferHeightTier } from "./buildingHeightResolve";
import type { PlanShadowInput } from "./buildingShadows";
import type { BuildingFeat, CityModel, Pt, Ring } from "../types";

export const SUN_STUDY_HOURS = [9, 10, 11, 12, 13, 14, 15] as const;

export const SUN_STUDY_SHADOW_OPACITY = 0.2;

export const SINGLE_SHADOW_OPACITY = 0.5;

export function sunStudyHourLabel(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour === 0 || hour === 24) return "12am";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export type SunStudyDate = Pick<PlanShadowInput, "lat" | "lon" | "year" | "month" | "day">;

function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

export function sunStudyModelKey(model: CityModel): string {
  const t = model.terrain;
  return [
    model.sideM,
    model.frameShape ?? "square",
    t ? `${t.cols}x${t.rows}:${t.min}:${t.max}` : "flat",
    model.buildings.length,
    hashText(buildingHeightsFingerprint(model.buildings)),
  ].join("|");
}

export function sunStudyHourKey(modelKey: string, date: SunStudyDate, hour: number): string {
  return `${modelKey}|${date.lat}|${date.lon}|${date.year}-${date.month}-${date.day}|${hour}`;
}

export type SunStudySun = {
  hour: number;
  label: string;
  at: Pt;
  labelAt: Pt;
};

export function sunStudySuns(date: SunStudyDate, radiusM: number, sunSize: number, labelSize: number): SunStudySun[] {
  const suns: SunStudySun[] = [];
  for (const hour of SUN_STUDY_HOURS) {
    const sample = sunAtMelbourneLocal(date.lat, date.lon, date.year, date.month, date.day, hour, 0);
    if (!sample.aboveHorizon) continue;
    const east = sample.direction[0] * radiusM;
    const north = -sample.direction[2] * radiusM;
    const len = Math.hypot(east, north) || 1;
    const k = Math.min(1, (sunSize + labelSize * 1.1) / len);
    suns.push({
      hour,
      label: sunStudyHourLabel(hour),
      at: [east, north],
      labelAt: [east - east * k, north - north * k],
    });
  }
  return suns;
}

export function hiddenBySunStudy(label: { east: number; north: number }, suns: SunStudySun[], radiusM: number): boolean {
  return suns.some((sun) => Math.hypot(label.east - sun.at[0], label.north - sun.at[1]) < radiusM * 0.09);
}

export function sunStudyDateArc(date: SunStudyDate, radiusM: number): Pt[] {
  const points: Pt[] = [];
  for (let minutes = 4 * 60; minutes <= 21 * 60; minutes += 10) {
    const s = sunAtMelbourneLocal(date.lat, date.lon, date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60);
    if (!s.aboveHorizon) continue;
    points.push([s.direction[0] * radiusM, -s.direction[2] * radiusM]);
  }
  return points;
}

export const SUN_STUDY_TREE_OPACITY = 0.5;

export function sunStudyMutedOn(sunStudy: boolean | undefined, muted: boolean | undefined): boolean {
  return Boolean(sunStudy) && muted !== false;
}

export const SUN_STUDY_CLICK_PX = 4;

export function isClick(dxPx: number, dyPx: number): boolean {
  return Math.hypot(dxPx, dyPx) <= SUN_STUDY_CLICK_PX;
}

function inRing(point: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pickSmallestAtPoint(buildings: BuildingFeat[], point: Pt): BuildingFeat | null {
  let best: BuildingFeat | null = null;
  let bestArea = Infinity;
  for (const building of buildings) {
    if (!inRing(point, building.ring) || building.holes.some((hole) => inRing(point, hole))) continue;
    const area = Math.abs(ringArea(building.ring));
    if (area < bestArea) {
      best = building;
      bestArea = area;
    }
  }
  return best;
}

export function pickBuilding(buildings: BuildingFeat[], point: Pt): BuildingFeat | null {
  const visible = buildings.filter((building) => !building.importedMassingShadowCaster);
  const onVisible = pickSmallestAtPoint(visible, point);
  if (onVisible) return onVisible;
  return pickSmallestAtPoint(buildings, point);
}

type StudyFootprint = { ring: Ring; holes: Ring[] };

function ringCentroid(ring: Ring): Pt {
  const pts =
    ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring;
  let east = 0;
  let north = 0;
  for (const [x, y] of pts) {
    east += x;
    north += y;
  }
  const count = pts.length || 1;
  return [east / count, north / count];
}

function casterUnderFootprint(centroid: Pt, footprint: StudyFootprint): boolean {
  return inRing(centroid, footprint.ring) && !footprint.holes.some((hole) => inRing(centroid, hole));
}

export function sunStudySelectionFootprints(buildings: BuildingFeat[], selected: readonly number[]): StudyFootprint[] {
  const ids = new Set(selected);
  const displays = buildings.filter((building) => building.importedMassingSkipShadow);
  const footprints: StudyFootprint[] = [];
  for (const building of buildings) {
    if (!ids.has(building.id)) continue;
    if (building.importedMassingSkipShadow) {
      footprints.push({ ring: building.ring, holes: building.holes });
      continue;
    }
    if (building.importedMassingShadowCaster) {
      const centroid = ringCentroid(building.ring);
      const host = displays.find(
        (display) =>
          inRing(centroid, display.ring) && !display.holes.some((hole) => inRing(centroid, hole)),
      );
      if (host) footprints.push({ ring: host.ring, holes: host.holes });
      else footprints.push({ ring: building.ring, holes: building.holes });
      continue;
    }
    footprints.push({ ring: building.ring, holes: building.holes });
  }
  return footprints;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  return sum / 2;
}

export function toggleSelection(selected: readonly number[], id: number): number[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

export type SunStudyCasters = "all" | "selected";

export function sunStudyShadowCasters(
  buildings: BuildingFeat[],
  casters: SunStudyCasters,
  selected: readonly number[],
): BuildingFeat[] {
  if (casters === "all") return buildings;
  const ids = new Set(selected);
  const footprints = sunStudySelectionFootprints(buildings, selected);
  return buildings.filter((building) => {
    if (building.importedMassingSkipShadow) return false;
    if (!building.importedMassing) return ids.has(building.id);
    if (ids.has(building.id)) return true;
    if (!building.importedMassingShadowCaster) return false;
    const centroid = ringCentroid(building.ring);
    return footprints.some((footprint) => casterUnderFootprint(centroid, footprint));
  });
}

export function sunStudyCasterModel(model: CityModel, casters: SunStudyCasters, selected: readonly number[]): CityModel {
  if (casters === "all") return model;
  return { ...model, buildings: sunStudyShadowCasters(model.buildings, casters, selected) };
}

export function isEstimatedHeight(building: BuildingFeat): boolean {
  const tier = inferHeightTier(building);
  return tier === "zone_default" || tier === "real_source_unmatched";
}

export function estimatedHeightLabel(building: BuildingFeat): string {
  return `~${Math.round(building.height)} m est.`;
}

export type EstLabel = { id: number; text: string; at: Pt };

export function estimatedHeightLabels(
  casters: BuildingFeat[],
  selected: readonly number[],
  fontM: number,
): EstLabel[] {
  const ids = new Set(selected);
  const labels: EstLabel[] = [];
  for (const building of casters) {
    if (!isEstimatedHeight(building)) continue;
    let minE = Infinity;
    let maxE = -Infinity;
    let e = 0;
    let n = 0;
    for (const [x, y] of building.ring) {
      minE = Math.min(minE, x);
      maxE = Math.max(maxE, x);
      e += x;
      n += y;
    }
    const text = estimatedHeightLabel(building);
    const fits = maxE - minE >= text.length * fontM * 0.55;
    if (!ids.has(building.id) && !fits) continue;
    labels.push({ id: building.id, text, at: [e / building.ring.length, n / building.ring.length] });
  }
  return labels;
}
