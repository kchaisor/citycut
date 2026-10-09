/** MGA zone and CRS label only. No proj4 here, so the model page can show the CRS without loading it. */

/**
 * WGS84 is treated as GDA2020. The difference is about a metre in Australia,
 * which is enough for early site work and is not a survey transformation.
 */
export const CRS_NOTE =
  "WGS84 is projected as GDA2020 without a datum shift, about a metre off for site work. The MGA zone follows this block’s longitude; west of 144°E is zone 54 (EPSG:7854).";

/** Official GDA2020 / MGA zone codes are EPSG:7846 through EPSG:7858. */
const MGA_EPSG_ZONE_MIN = 46;
const MGA_EPSG_ZONE_MAX = 58;

export type MgaCrs = {
  zone: number;
  /** Set when this zone has a GDA2020 / MGA EPSG code. */
  epsg: number | null;
  name: string;
};

/** Six-degree MGA zone. Zone 55 is [144°E, 150°E). */
export function mgaZone(longitude: number): number {
  if (!Number.isFinite(longitude)) {
    throw new Error("CityCut needs a finite longitude to choose an MGA zone.");
  }
  const lon = Math.min(180, Math.max(-180, longitude));
  if (lon === 180) return 60;
  return Math.floor((lon + 180) / 6) + 1;
}

export function mgaCrs(longitude: number): MgaCrs {
  const zone = mgaZone(longitude);
  const epsg =
    zone >= MGA_EPSG_ZONE_MIN && zone <= MGA_EPSG_ZONE_MAX ? 7800 + zone : null;
  const name =
    epsg != null
      ? `GDA2020 / MGA zone ${zone} (EPSG:${epsg})`
      : `GDA2020 MGA parameters, zone ${zone}`;
  return { zone, epsg, name };
}
