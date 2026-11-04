import { gunzipSync } from "fflate";
import { latLngToCell } from "h3-js";
import type { ReachPeriod } from "./constants";
import { REACH_H3_RES } from "./constants";
import type { ReachDataset, ReachManifest, ReachStation } from "./types";
import { assembleReachDataset } from "./assembleReachDataset";

function reachBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}reach/`.replace(/\/?$/, "/");
}

async function fetchArrayBuffer(relativePath: string): Promise<ArrayBuffer> {
  const res = await fetch(relativePath);
  if (!res.ok) throw new Error(`Reach data failed: ${relativePath}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (relativePath.endsWith(".gz") && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const raw = gunzipSync(bytes);
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  }
  return buf;
}

export async function fetchReachPtProfile(
  manifest: ReachManifest,
  period: ReachPeriod,
): Promise<ArrayBuffer> {
  const root = reachBaseUrl();
  return fetchArrayBuffer(`${root}${manifest.files[period]!}`);
}

export async function loadReachDataset(): Promise<ReachDataset> {
  const root = reachBaseUrl();
  const manifestRes = await fetch(`${root}reach-manifest.json`);
  if (!manifestRes.ok) throw new Error("Reach manifest missing");
  const manifest = (await manifestRes.json()) as ReachManifest;
  const [cellsJson, graphBuf, stationsJson] = await Promise.all([
    fetch(`${root}${manifest.files.cells}`).then((r) => r.json()) as Promise<string[]>,
    fetchArrayBuffer(`${root}${manifest.files.graph}`),
    fetch(`${root}${manifest.files.stations}`).then((r) => r.json()) as Promise<ReachStation[]>,
  ]);
  const ptBuffers: ArrayBuffer[] = [];
  for (const profile of manifest.profiles) {
    ptBuffers.push(await fetchReachPtProfile(manifest, profile));
  }
  return assembleReachDataset(manifest, cellsJson, graphBuf, stationsJson, ptBuffers);
}

export function defaultOriginCell(dataset: ReachDataset, lat: number, lng: number): number {
  const target = latLngToCell(lat, lng, REACH_H3_RES);
  for (let i = 0; i < dataset.h3Indices.length; i++) {
    if (dataset.h3Indices[i] === target) return i;
  }
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < dataset.lat.length; i++) {
    const dlat = dataset.lat[i]! - lat;
    const dlng = dataset.lng[i]! - lng;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
