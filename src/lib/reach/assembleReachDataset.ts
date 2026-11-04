import { cellToLatLng } from "h3-js";
import type { ReachPeriod } from "./constants";
import type { ReachDataset, ReachManifest, ReachStation } from "./types";

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

export function assembleReachDataset(
  manifest: ReachManifest,
  cellsJson: string[],
  graphBuf: ArrayBuffer,
  stationsJson: ReachStation[],
  ptBuffers: ArrayBuffer[],
): ReachDataset {
  const cellCount = manifest.cellCount;
  const h3Indices = cellsJson;
  const lat = new Float32Array(cellCount);
  const lng = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const [la, lo] = cellToLatLng(h3Indices[i]!);
    lat[i] = la;
    lng[i] = lo;
  }
  const { neighbors, edgeMinutes } = readNeighbors(graphBuf, cellCount);
  const stations = stationsJson;
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
