import type { NswLayers } from "./nswLayers";
import { NSW_BUILDING_ESTIMATE_NOTE, regionCredit } from "./sources/registry";
import type { AreaFeat } from "../types";

/** Ids for NSW water areas, clear of Overture base ids. */
export const NSW_WATER_ID_BASE = 9_000_000;

/**
 * NSW water is HydroArea (Spatial Services) when that layer loaded, replacing Overture water.
 * When it failed, Overture water stays and the note says so. Green and other areas are untouched.
 */
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

/** Sentences for the model source note: credit plus every NSW layer that did not fully load. */
export function nswSourceNote(nsw: NswLayers | null): string {
  const parts = [`NSW mode. ${regionCredit("nsw")}.`, NSW_BUILDING_ESTIMATE_NOTE];
  if (!nsw) parts.push("NSW layers did not load.");
  else for (const layer of Object.values(nsw.status)) if (layer.status !== "ok" && layer.note) parts.push(layer.note);
  return parts.join(" ");
}
