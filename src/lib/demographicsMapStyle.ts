import type maplibregl from "maplibre-gl";
import { getColour } from "./colours";

const ROAD_LAYER = /road|highway|street|bridge|tunnel|transport|path/i;
const ROAD_LABEL = /road|highway|street|transport|ref|shield/i;
export function trimStyleForDemographicsRoads(map: maplibregl.Map): void {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  for (const layer of layers) {
    const id = layer.id;
    if (layer.type === "background") continue;
    const keep = ROAD_LAYER.test(id) || (layer.type === "symbol" && ROAD_LABEL.test(id));
    if (keep) {
      map.setLayoutProperty(id, "visibility", "visible");
      if (layer.type === "line") {
        map.setPaintProperty(id, "line-color", getColour("--demographics-parcel-line"));
      }
      continue;
    }
    map.setLayoutProperty(id, "visibility", "none");
  }
}
