import { toLocal } from "./geo";
import type { LonLat } from "../types";
import type { DemographicsPin } from "./demographicsExplorerReducer";

export const DEMOGRAPHICS_PIN_FITZROY: LonLat = { lon: 144.9778, lat: -37.8032 };
export const DEMOGRAPHICS_PIN_CARLTON: LonLat = { lon: 144.9705, lat: -37.8045 };

export function pinFromLonLat(origin: LonLat, point: LonLat, label: string): DemographicsPin {
  const [east, north] = toLocal(point.lat, point.lon, origin);
  return { east, north, label };
}
