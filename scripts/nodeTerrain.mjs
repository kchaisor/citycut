import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TERRAIN_TILE_SIZE,
  TERRAIN_UNAVAILABLE,
  decodeTerrarium,
  heightFieldFromTiles,
  preferredTerrainZoom,
  terrainFetchBBox,
  terrainTileUrl,
  tilesForBBox,
} from "../src/lib/terrain.ts";

const exec = promisify(execFile);

async function decodeTerrariumWebpFfmpeg(bytes) {
  const dir = await mkdtemp(join(tmpdir(), "citycut-webp-"));
  const input = join(dir, "tile.webp");
  const output = join(dir, "tile.rgba");
  try {
    await writeFile(input, Buffer.from(bytes));
    await exec("ffmpeg", ["-y", "-i", input, "-f", "rawvideo", "-pix_fmt", "rgba", output], {
      timeout: 20_000,
    });
    const rgba = await readFile(output);
    return {
      width: TERRAIN_TILE_SIZE,
      height: TERRAIN_TILE_SIZE,
      heights: decodeTerrarium(rgba, TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function loadZoom(center, sideM, zoom) {
  const coords = tilesForBBox(terrainFetchBBox(center, sideM, zoom), zoom);
  if (coords.length === 0 || coords.length > 9) return null;
  const tiles = await Promise.all(
    coords.map(async ({ x, y }) => {
      const response = await fetch(terrainTileUrl(zoom, x, y));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(TERRAIN_UNAVAILABLE);
      const decoded = await decodeTerrariumWebpFfmpeg(await response.arrayBuffer());
      return { x, y, ...decoded };
    }),
  );
  if (tiles.some((tile) => tile === null)) return null;
  return tiles;
}

export async function fetchTerrainForCutNode(center, sideM) {
  let zoom = preferredTerrainZoom(center.lat);
  for (; zoom >= 8; zoom--) {
    const tiles = await loadZoom(center, sideM, zoom);
    if (!tiles) continue;
    return heightFieldFromTiles(tiles, center, sideM, zoom);
  }
  throw new Error(TERRAIN_UNAVAILABLE);
}
