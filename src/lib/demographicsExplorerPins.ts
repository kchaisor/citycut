import type { LonLat } from "../types";
import type { DemographicsPin } from "./demographicsExplorerReducer";

export const DEMOGRAPHICS_PIN_FITZROY: LonLat = { lon: 144.9778, lat: -37.8032 };
export const DEMOGRAPHICS_PIN_CARLTON: LonLat = { lon: 144.9705, lat: -37.8045 };

export function pinFromLonLat(point: LonLat, label: string): DemographicsPin {
  return { lon: point.lon, lat: point.lat, label };
}

export function pinLonLat(pin: DemographicsPin): LonLat {
  return { lon: pin.lon, lat: pin.lat };
}
