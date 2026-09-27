import type { LonLat, TerrainField } from "../types";
import {
  TERRAIN_UNAVAILABLE,
  decodeTerrarium,
  heightFieldFromTiles,
  preferredTerrainZoom,
  terrainFetchBBox,
  terrainTileUrl,
  tilesForBBox,
  type DecodedTile,
} from "./terrain";

async function decodeWebp(blob: Blob): Promise<{ width: number; height: number; heights: Float32Array }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error(TERRAIN_UNAVAILABLE);
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: image.width,
      height: image.height,
      heights: decodeTerrarium(image.data, image.width, image.height),
    };
  } finally {
    bitmap.close();
  }
}

/** null means this zoom has no coverage (HTTP 404) and the caller should step down. */
async function loadZoom(
  center: LonLat,
  sideM: number,
  zoom: number,
  signal: AbortSignal | undefined,
): Promise<DecodedTile[] | null> {
  const coords = tilesForBBox(terrainFetchBBox(center, sideM, zoom), zoom);
  if (coords.length === 0 || coords.length > 9) return null;
  const tiles = await Promise.all(
    coords.map(async ({ x, y }) => {
      const response = await fetch(terrainTileUrl(zoom, x, y), { signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(TERRAIN_UNAVAILABLE);
      const decoded = await decodeWebp(await response.blob());
      return { x, y, ...decoded };
    }),
  );
  if (tiles.some((tile) => tile === null)) return null;
  return tiles as DecodedTile[];
}

/**
 * Fetch the Mapterhorn tiles covering a cut and resample them into local metres.
 * Starts at the preferred zoom and steps down while tiles 404.
 */
function aborted(signal: AbortSignal | undefined, err: unknown): boolean {
  if (signal?.aborted) return true;
  return err instanceof DOMException && err.name === "AbortError";
}

export async function fetchTerrainForCut(
  center: LonLat,
  sideM: number,
  signal?: AbortSignal,
): Promise<TerrainField> {
  try {
    let zoom = preferredTerrainZoom(center.lat);
    for (; zoom >= 8; zoom--) {
      const tiles = await loadZoom(center, sideM, zoom, signal);
      if (!tiles) continue;
      return heightFieldFromTiles(tiles, center, sideM, zoom);
    }
  } catch (err) {
    if (aborted(signal, err)) throw err;
  }
  throw new Error(TERRAIN_UNAVAILABLE);
}
