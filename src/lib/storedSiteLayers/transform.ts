import { mgaToLocal, projectLonLat } from "../crs";
import { toLocal } from "../geo";
import type { LonLat, Pt } from "../../types";
import type { StoredSiteLayerManifest } from "./types";

export function storedSiteRelativeMgaToLocal(
  x: number,
  y: number,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
): Pt {
  const e = manifest.origin.mga[0] + x;
  const n = manifest.origin.mga[1] + y;
  return mgaToLocal(e, n, origin, zone);
}

export function storedSiteRelativeMgaToAhd(z: number, manifest: StoredSiteLayerManifest): number {
  return manifest.origin.mga[2] + z;
}

export function storedSiteRelativeToScene(
  x: number,
  y: number,
  z: number,
  manifest: StoredSiteLayerManifest,
  origin: LonLat,
  zone: number,
): [number, number, number] {
  const [east, north] = storedSiteRelativeMgaToLocal(x, y, manifest, origin, zone);
  const ahd = storedSiteRelativeMgaToAhd(z, manifest);
  return [east, ahd, -north];
}

export function footprintLonLatToLocal(lon: number, lat: number, origin: LonLat): Pt {
  return toLocal(lat, lon, origin);
}

export function mgaLonLatRoundTripErrorM(lon: number, lat: number, origin: LonLat, zone: number): number {
  const local = footprintLonLatToLocal(lon, lat, origin);
  const [e, n] = projectLonLat(lon, lat, zone);
  const back = mgaToLocal(e, n, origin, zone);
  return Math.hypot(local[0] - back[0], local[1] - back[1]);
}
