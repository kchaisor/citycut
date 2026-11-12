import { mgaCrs } from "../crsZone";
import type { LonLat } from "../../types";
import { type FrameGroundSize, type SiteFrameShape } from "../siteFrame";
import {
  parseStoredSiteManifest,
  registryEntryForCut,
  storedSiteManifestUrl,
  storedSiteAssetUrl,
} from "./registry";
import { parseStoredSiteFootprints } from "./footprints";
import type { StoredSiteLayerPack } from "./types";

export async function loadStoredSiteLayerPack(
  center: LonLat,
  sideM: number,
  frameShape: SiteFrameShape,
  frameSize: FrameGroundSize | undefined,
  signal?: AbortSignal,
): Promise<StoredSiteLayerPack | null> {
  const entry = registryEntryForCut(center, sideM);
  if (!entry) return null;
  const manifestRes = await fetch(storedSiteManifestUrl(entry.manifestPath), { signal });
  if (!manifestRes.ok) return null;
  const manifest = parseStoredSiteManifest(await manifestRes.json());
  if (!manifest || manifest.id !== entry.id) return null;
  const footprintsRes = await fetch(storedSiteAssetUrl(entry.id, "footprints.geojson"), { signal });
  if (!footprintsRes.ok) return null;
  const collection = await footprintsRes.json();
  const { footprints, structures } = parseStoredSiteFootprints(
    collection,
    center,
    sideM,
    frameShape,
    frameSize,
  );
  const zone = mgaCrs(center.lon).zone;
  return { manifest, footprints, structures, center, zone };
}
