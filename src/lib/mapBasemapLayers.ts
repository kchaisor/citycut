import type maplibregl from "maplibre-gl";

/** Anchor for legacy landuse overlays; unused by the building-only landing preview. */
export function landingCutLanduseBeforeLayer(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers;
  if (!layers) return undefined;
  const waterway = layers.find((layer) => layer.id === "waterway");
  if (waterway) return waterway.id;
  const firstTransportLine = layers.find(
    (layer) => layer.type === "line" && "source-layer" in layer && layer["source-layer"] === "transportation",
  );
  if (firstTransportLine) return firstTransportLine.id;
  return layers.find((layer) => layer.type === "symbol")?.id;
}

/** Use-coloured buildings and their mask sit above basemap `building`, below road casings. */
export function landingCutBuildingsBeforeLayer(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers;
  if (!layers) return undefined;
  const buildingIdx = layers.findIndex((layer) => layer.id === "building");
  if (buildingIdx >= 0) {
    for (let i = buildingIdx + 1; i < layers.length; i++) {
      const layer = layers[i]!;
      if (layer.type === "line") return layer.id;
    }
  }
  return landingCutLanduseBeforeLayer(map);
}

/** @deprecated use landingCutLanduseBeforeLayer */
export function landingCutColourBeforeLayer(map: maplibregl.Map): string | undefined {
  return landingCutLanduseBeforeLayer(map);
}
