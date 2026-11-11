import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { ReachManifest, ReachStation } from "./types";
import { assembleReachDataset } from "./assembleReachDataset";

async function readArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  const buf = await fs.readFile(filePath);
  const raw = filePath.endsWith(".gz") ? gunzipSync(buf) : buf;
  const slice = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  return slice as ArrayBuffer;
}

export async function loadReachDatasetFromDir(reachDir: string) {
  const manifest = JSON.parse(await fs.readFile(path.join(reachDir, "reach-manifest.json"), "utf8")) as ReachManifest;
  const [cellsJson, graphBuf, stationsJson, ...ptBuffers] = await Promise.all([
    fs.readFile(path.join(reachDir, manifest.files.cells), "utf8").then((t) => JSON.parse(t) as string[]),
    readArrayBuffer(path.join(reachDir, manifest.files.graph)),
    fs.readFile(path.join(reachDir, manifest.files.stations), "utf8").then((t) => JSON.parse(t) as ReachStation[]),
    ...manifest.profiles.map((p) => readArrayBuffer(path.join(reachDir, manifest.files[p]!))),
  ]);
  return assembleReachDataset(manifest, cellsJson, graphBuf, stationsJson, ptBuffers);
}
