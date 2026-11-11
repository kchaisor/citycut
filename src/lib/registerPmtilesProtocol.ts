import maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";

let registered = false;
let protocolInstance: Protocol | null = null;

export function getPmtilesProtocol(): Protocol {
  if (!protocolInstance) protocolInstance = new Protocol();
  return protocolInstance;
}

export function sharedPmtilesForAbsoluteUrl(absoluteUrl: string): PMTiles {
  const protocol = getPmtilesProtocol();
  let instance = protocol.tiles.get(absoluteUrl);
  if (!instance) {
    instance = new PMTiles(new EnrichmentPmtilesSource(absoluteUrl));
    protocol.tiles.set(absoluteUrl, instance);
  }
  return instance;
}

export function ensurePmtilesProtocol(): void {
  if (registered || typeof window === "undefined") return;
  if (typeof maplibregl.addProtocol !== "function") return;
  maplibregl.addProtocol("pmtiles", getPmtilesProtocol().tile);
  registered = true;
}
