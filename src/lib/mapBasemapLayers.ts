import type maplibregl from "maplibre-gl";

/** Insert landing Overture fills and the landuse mask below road, rail, and label stacks. */
export function landingCutColourBeforeLayer(map: maplibregl.Map): string | undefined {
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
