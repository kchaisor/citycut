import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { RangeResponse, Source } from "pmtiles";
import { PMTiles } from "pmtiles";
import type { BuildingEnrichmentRecord } from "../buildingEnrichmentTiles";
import { ENRICHMENT_TILE_ZOOM, fetchBuildingEnrichmentForCut } from "../buildingEnrichmentTiles";

const LOCAL_PMTILES = resolve(process.cwd(), "public/building-enrichment.pmtiles");

class NodePmtilesFileSource implements Source {
  constructor(private path: string) {}

  getKey(): string {
    return this.path;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const buffer = readFileSync(this.path);
    const slice = buffer.subarray(offset, offset + length);
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) };
  }
}

function tileRange(bounds: { south: number; west: number; north: number; east: number }, z: number) {
  const n = 2 ** z;
  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const latRad = (lat: number) => (lat * Math.PI) / 180;
  const yFor = (lat: number) =>
    Math.floor(((1 - Math.log(Math.tan(latRad(lat)) + 1 / Math.cos(latRad(lat))) / Math.PI) / 2) * n);
  const yMin = Math.min(yFor(bounds.north), yFor(bounds.south));
  const yMax = Math.max(yFor(bounds.north), yFor(bounds.south));
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

/** Vitest/node: read committed public/building-enrichment.pmtiles from disk. */
export async function loadEnrichmentForCutFromDisk(
  bounds: { south: number; west: number; north: number; east: number },
): Promise<{ byId: Map<string, BuildingEnrichmentRecord>; error: string | null }> {
  if (!existsSync(LOCAL_PMTILES)) {
    return fetchBuildingEnrichmentForCut(bounds);
  }
  const byId = new Map<string, BuildingEnrichmentRecord>();
  const pmtiles = new PMTiles(new NodePmtilesFileSource(LOCAL_PMTILES));
  const tiles = tileRange(bounds, ENRICHMENT_TILE_ZOOM);
  for (const { z, x, y } of tiles) {
    const response = await pmtiles.getZxy(z, x, y);
    if (!response?.data) continue;
    const vt = new VectorTile(new PbfReader(response.data));
    const layer = vt.layers.building_enrichment ?? vt.layers.buildings;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const props = feature.properties as Record<string, unknown>;
      const id = typeof props.overture_id === "string" ? props.overture_id : String(props.id ?? "");
      if (!id) continue;
      const use = typeof props.use === "string" ? props.use : null;
      const useSource = typeof props.use_source === "string" ? props.use_source : null;
      if (!use || !useSource) continue;
      byId.set(id, {
        overtureId: id,
        use: use as BuildingEnrichmentRecord["use"],
        useSource: useSource as BuildingEnrichmentRecord["useSource"],
        heightM: null,
        heightSource: null,
        zoneCode: typeof props.zone_code === "string" ? props.zone_code : null,
      });
    }
  }
  return { byId, error: null };
}
