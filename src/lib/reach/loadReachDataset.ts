import { cellToLatLng, latLngToCell } from "h3-js";
import type { ReachPeriod } from "./constants";
import { REACH_H3_RES } from "./constants";
import type { ReachDataset, ReachManifest, ReachStation } from "./types";

function reachBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}reach/`.replace(/\/?$/, "/");
}

async function fetchArrayBuffer(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Reach data failed: ${path}`);
  return res.arrayBuffer();
}

function readNeighbors(buf: ArrayBuffer, cellCount: number): { neighbors: Uint16Array[]; edgeMinutes: Float32Array[] } {
  const view = new DataView(buf);
  let o = 0;
  const neighbors: Uint16Array[] = [];
  const edgeMinutes: Float32Array[] = [];
  for (let i = 0; i < cellCount; i++) {
    const count = view.getUint8(o);
    o += 1;
    const nbrs = new Uint16Array(count);
    const weights = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      nbrs[k] = view.getUint16(o, true);
      o += 2;
      weights[k] = view.getUint16(o, true) / 1000;
      o += 2;
    }
    neighbors.push(nbrs);
    edgeMinutes.push(weights);
  }
  return { neighbors, edgeMinutes };
}

export async function loadReachDataset(): Promise<ReachDataset> {
  const root = reachBaseUrl();
  const manifestRes = await fetch(`${root}reach-manifest.json`);
  if (!manifestRes.ok) throw new Error("Reach manifest missing");
  const manifest = (await manifestRes.json()) as ReachManifest;
  const cellCount = manifest.cellCount;
  const [cellsJson, graphBuf, stationsJson, ...ptBuffers] = await Promise.all([
    fetch(`${root}${manifest.files.cells}`).then((r) => r.json()) as Promise<string[]>,
    fetchArrayBuffer(`${root}${manifest.files.graph}`),
    fetch(`${root}${manifest.files.stations}`).then((r) => r.json()),
    ...manifest.profiles.map((p) => fetchArrayBuffer(`${root}${manifest.files[p]}`)),
  ]);
  const h3Indices = cellsJson;
  const lat = new Float32Array(cellCount);
  const lng = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const [la, lo] = cellToLatLng(h3Indices[i]!);
    lat[i] = la;
    lng[i] = lo;
  }
  const { neighbors, edgeMinutes } = readNeighbors(graphBuf, cellCount);
  const stations = stationsJson as ReachStation[];
  const ptMinutes = {} as Record<ReachPeriod, Uint8Array>;
  manifest.profiles.forEach((profile, index) => {
    ptMinutes[profile] = new Uint8Array(ptBuffers[index]!);
  });
  return {
    manifest,
    h3Indices,
    lat,
    lng,
    neighbors,
    edgeMinutes,
    stations,
    ptMinutes,
  };
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
