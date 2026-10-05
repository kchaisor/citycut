import { normaliseZoneCode } from "./buildingUse";

/** Footprints below this area use the shed height when height and floors are missing. */
export const SHED_MAX_FOOTPRINT_AREA_M2 = 40;
export const SHED_FALLBACK_HEIGHT_M = 3;
export const UNKNOWN_ZONE_FALLBACK_HEIGHT_M = 9;

export type ZoneFallbackHeightM = 6 | 7 | 8 | 9 | 10 | 12;

/** Default extrusion height (m) by normalised Vicmap zone code. Unlisted codes use {@link UNKNOWN_ZONE_FALLBACK_HEIGHT_M}. */
export const ZONE_FALLBACK_HEIGHT_M: Readonly<Record<string, ZoneFallbackHeightM>> = {
  NRZ: 6,
  GRZ: 7,
  RGZ: 10,
  MUZ: 12,
  ACZ: 12,
  CCZ: 12,
  CDZ: 12,
  C1Z: 8,
  C2Z: 8,
  C3Z: 8,
  IN1Z: 8,
  IN2Z: 8,
  IN3Z: 8,
  PUZ: 6,
  PPRZ: 6,
  PCRZ: 6,
};

export function zoneFallbackHeightM(code: string | null | undefined): ZoneFallbackHeightM | null {
  if (!code) return null;
  const normalised = normaliseZoneCode(code);
  return ZONE_FALLBACK_HEIGHT_M[normalised] ?? null;
}

export type FallbackHeightInput = {
  /** When null or unknown, the shed rule is skipped. */
  footprintAreaM2: number | null;
  zoneCode?: string | null;
};

/** Last-resort height when Overture/OSM height and floor count are both absent. */
export function fallbackBuildingHeightM(input: FallbackHeightInput): number {
  const { footprintAreaM2, zoneCode } = input;
  if (footprintAreaM2 !== null && footprintAreaM2 > 0 && footprintAreaM2 < SHED_MAX_FOOTPRINT_AREA_M2) {
    return SHED_FALLBACK_HEIGHT_M;
  }
  return zoneFallbackHeightM(zoneCode) ?? UNKNOWN_ZONE_FALLBACK_HEIGHT_M;
}
