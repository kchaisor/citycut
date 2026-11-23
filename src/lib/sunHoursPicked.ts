import type { SunHoursDirectOverlay } from "./sunHoursDirectAssess";
import type { SunHoursRoofRasterSource } from "./sunHoursRoofPlanRaster";

export type SunHoursFaceRange = { buildingId: number; start: number; count: number };

export const SUN_HOURS_PICK_HINT_3D = "Click a building to colour it. Shift-click adds.";
export const SUN_HOURS_PICK_HINT_PLAN = "Pick buildings in the 3D view to colour them.";

export function sunHoursFacesReplaceMassing(facesOn: boolean, pickedOnly: boolean): boolean {
  return facesOn && !pickedOnly;
}

export function sunHoursGroundShown(sunHoursOn: boolean, pickedOnly: boolean): boolean {
  return sunHoursOn && !pickedOnly;
}

function pickFaceRanges(
  positions: Float32Array,
  colors: Float32Array,
  ranges: readonly SunHoursFaceRange[],
  picked: ReadonlySet<number>,
): { positions: Float32Array; colors: Float32Array; ranges: SunHoursFaceRange[] } {
  const kept = ranges.filter((range) => picked.has(range.buildingId) && range.count > 0);
  const vertexCount = kept.reduce((sum, range) => sum + range.count, 0);
  const nextPositions = new Float32Array(vertexCount * 3);
  const nextColors = new Float32Array(vertexCount * 3);
  const nextRanges: SunHoursFaceRange[] = [];
  let cursor = 0;
  for (const range of kept) {
    const from = range.start * 3;
    const to = (range.start + range.count) * 3;
    nextPositions.set(positions.subarray(from, to), cursor * 3);
    nextColors.set(colors.subarray(from, to), cursor * 3);
    nextRanges.push({ buildingId: range.buildingId, start: cursor, count: range.count });
    cursor += range.count;
  }
  return { positions: nextPositions, colors: nextColors, ranges: nextRanges };
}

export function sunHoursOverlayForBuildings(
  overlay: SunHoursDirectOverlay,
  buildingIds: readonly number[],
): SunHoursDirectOverlay {
  const picked = new Set(buildingIds.map((id) => Number(id)));
  const roofs = pickFaceRanges(overlay.roofPositions, overlay.roofColors, overlay.roofRanges, picked);
  const walls = pickFaceRanges(overlay.wallPositions, overlay.wallColors, overlay.wallRanges, picked);
  return {
    ...overlay,
    positions: walls.positions,
    colors: walls.colors,
    roofPositions: roofs.positions,
    roofColors: roofs.colors,
    roofRanges: roofs.ranges,
    wallPositions: walls.positions,
    wallColors: walls.colors,
    wallRanges: walls.ranges,
  };
}

export function sunHoursRoofRasterSourceForBuildings(
  source: SunHoursRoofRasterSource,
  buildingIds: readonly number[],
): SunHoursRoofRasterSource | null {
  const picked = new Set(buildingIds.map((id) => Number(id)));
  const keep: number[] = [];
  for (let index = 0; index < source.buildingIds.length; index++) {
    if (picked.has(source.buildingIds[index]!)) keep.push(index);
  }
  if (keep.length === 0) return null;
  return {
    east: Float32Array.from(keep, (index) => source.east[index]!),
    north: Float32Array.from(keep, (index) => source.north[index]!),
    hours: Float32Array.from(keep, (index) => source.hours[index]!),
    buildingIds: Int32Array.from(keep, (index) => source.buildingIds[index]!),
    spanM: source.spanM,
  };
}
