import { toLocal } from "./geo";
import type { LonLat } from "../types";
import type { DemographicsPin } from "./demographicsExplorerReducer";

export const DEMOGRAPHICS_PIN_FITZROY: LonLat = { lon: 144.9782, lat: -37.7976 };
export const DEMOGRAPHICS_PIN_CARLTON: LonLat = { lon: 144.9665, lat: -37.8005 };

export function pinFromLonLat(origin: LonLat, point: LonLat, label: string): DemographicsPin {
  const [east, north] = toLocal(point.lat, point.lon, origin);
  return { east, north, label };
}
