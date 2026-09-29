import {
  DEFAULT_SIDE_KM,
  DEFAULT_ZOOM,
  MAX_SIDE_KM,
  MELBOURNE,
  MELBOURNE_LABEL,
  MIN_SIDE_KM,
} from "../content/constants";
import type { ViewState } from "../types";

export type FrameQuery = {
  view: ViewState;
  sideKm: number;
  label: string;
};

/** Empty and whitespace-only values are missing. Anything else must be a finite number. */
function readNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readCoordinate(raw: string | null, min: number, max: number): number | null {
  const value = readNumber(raw);
  if (value == null || value < min || value > max) return null;
  return value;
}

function readSideKm(raw: string | null): number {
  const value = readNumber(raw);
  if (value == null) return DEFAULT_SIDE_KM;
  return Math.min(MAX_SIDE_KM, Math.max(MIN_SIDE_KM, value));
}

/** Parse `lat`, `lon`, and `km` from a query string. A leading `?` is optional. */
export function frameFromSearch(search: string): FrameQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lat = readCoordinate(params.get("lat"), -90, 90);
  const lon = readCoordinate(params.get("lon"), -180, 180);
  const sideKm = readSideKm(params.get("km"));
  if (lat == null || lon == null) {
    return {
      view: { lat: MELBOURNE.lat, lon: MELBOURNE.lon, zoom: DEFAULT_ZOOM },
      sideKm,
      label: MELBOURNE_LABEL,
    };
  }
  return {
    view: { lat, lon, zoom: DEFAULT_ZOOM },
    sideKm,
    label: params.get("label") || "Selected frame",
  };
}
