import type { DemographicsDataset } from "./demographicsTypes";

export const DEMOGRAPHICS_MANIFEST_URL = `${import.meta.env.BASE_URL}demographics-manifest.json`;
export const DEMOGRAPHICS_DATA_URL = `${import.meta.env.BASE_URL}demographics-metro.json`;

export type DemographicsManifest = {
  version: number;
  dataUrl: string;
  gccsa: "2GMEL";
  bbox: DemographicsDataset["bbox"];
  unitCount: number;
  builtAt: string;
  source: string;
  licence: string;
};

let cachedDataset: DemographicsDataset | null = null;
let loadPromise: Promise<DemographicsDataset | null> | null = null;

export async function loadDemographicsDataset(force = false): Promise<DemographicsDataset | null> {
  if (!force && cachedDataset) return cachedDataset;
  if (!force && loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const manifestRes = await fetch(DEMOGRAPHICS_MANIFEST_URL);
      if (!manifestRes.ok) return null;
      const manifest = (await manifestRes.json()) as DemographicsManifest;
      const dataPath = manifest.dataUrl?.startsWith("http")
        ? manifest.dataUrl
        : `${import.meta.env.BASE_URL}${(manifest.dataUrl || "demographics-metro.json").replace(/^\//, "")}`;
      const dataRes = await fetch(dataPath);
      if (!dataRes.ok) return null;
      const dataset = (await dataRes.json()) as DemographicsDataset;
      if (!dataset?.units?.length) return null;
      cachedDataset = dataset;
      return dataset;
    } catch {
      return null;
    }
  })();
  return loadPromise;
}

export function clearDemographicsDatasetCache(): void {
  cachedDataset = null;
  loadPromise = null;
}
