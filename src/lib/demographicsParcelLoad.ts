import type { DemographicsParcelsDataset } from "./demographicsParcels";

export const DEMOGRAPHICS_PARCELS_MANIFEST_URL = `${import.meta.env.BASE_URL}demographics-parcels-manifest.json`;
export const DEMOGRAPHICS_PARCELS_DATA_URL = `${import.meta.env.BASE_URL}demographics-parcels.json`;

let cached: DemographicsParcelsDataset | null = null;

export async function loadDemographicsParcels(): Promise<DemographicsParcelsDataset | null> {
  if (cached) return cached;
  try {
    const manifestRes = await fetch(DEMOGRAPHICS_PARCELS_MANIFEST_URL, { cache: "force-cache" });
    if (!manifestRes.ok) return null;
    const manifest = (await manifestRes.json()) as { compactUrl?: string };
    const dataUrl = manifest.compactUrl
      ? `${import.meta.env.BASE_URL}${manifest.compactUrl.replace(/^\//, "")}`
      : DEMOGRAPHICS_PARCELS_DATA_URL;
    const dataRes = await fetch(dataUrl, { cache: "force-cache" });
    if (!dataRes.ok) return null;
    cached = (await dataRes.json()) as DemographicsParcelsDataset;
    return cached;
  } catch {
    return null;
  }
}
