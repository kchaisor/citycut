import { M_PER_DEG_LAT, formatKmSide, mPerDegLon } from "./geo";
import type { LonLat } from "../types";

/**
 * Nominatim `display_name` for a street address leads with the house number
 * and a comma (`1-9, Gertrude Street, Fitzroy, ...`). The old label kept
 * `name` or that first segment, so a range showed up as only `1-9`.
 */
export type GeocoderAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
  suburb?: string;
  city_district?: string;
  town?: string;
  locality?: string;
  city?: string;
  state?: string;
  postcode?: string;
  "ISO3166-2-lvl4"?: string;
};

export type GeocoderRow = {
  name?: string;
  display_name?: string;
  address?: GeocoderAddress;
};

export const LOCALITY_FIELDS = ["suburb", "city_district", "town", "locality"] as const;

export const MOVED_AWAY_M = 50;

export const REVERSE_DEBOUNCE_MS = 800;

const STATE_ABBR: Record<string, string> = {
  victoria: "VIC",
  "new south wales": "NSW",
  queensland: "QLD",
  "south australia": "SA",
  "western australia": "WA",
  tasmania: "TAS",
  "northern territory": "NT",
  "australian capital territory": "ACT",
  vic: "VIC",
  nsw: "NSW",
  qld: "QLD",
  sa: "SA",
  wa: "WA",
  tas: "TAS",
  nt: "NT",
  act: "ACT",
};

const STREET_TYPE: Record<string, string> = {
  alley: "Ally",
  arcade: "Arc",
  avenue: "Ave",
  boulevard: "Bvd",
  circuit: "Cct",
  close: "Cl",
  court: "Ct",
  crescent: "Cres",
  drive: "Dr",
  esplanade: "Esp",
  grove: "Gr",
  highway: "Hwy",
  lane: "Lane",
  parade: "Pde",
  place: "Pl",
  road: "Rd",
  square: "Sq",
  street: "St",
  terrace: "Tce",
  track: "Trk",
  walk: "Walk",
  way: "Way",
};

export function formatHouseNumber(raw: string): string {
  return raw.trim().replace(/(\d)\s*[-–—]\s*(\d)/g, "$1–$2");
}

export function abbreviateStreet(road: string): string {
  const parts = road.trim().split(/\s+/);
  if (parts.length === 0) return road.trim();
  const last = parts[parts.length - 1].replace(/\.$/, "");
  const abbr = STREET_TYPE[last.toLowerCase()];
  if (!abbr) return parts.join(" ");
  parts[parts.length - 1] = abbr;
  return parts.join(" ");
}

export function stateAbbreviation(address: GeocoderAddress): string | null {
  const iso = address["ISO3166-2-lvl4"]?.trim();
  if (iso && /^AU-[A-Z]{2,3}$/.test(iso)) return iso.slice(3);
  const state = address.state?.trim();
  if (!state) return null;
  return STATE_ABBR[state.toLowerCase()] ?? state;
}

export function localityName(address: GeocoderAddress): string | null {
  for (const key of LOCALITY_FIELDS) {
    const value = address[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function formatLocality(address: GeocoderAddress): string | null {
  const name = localityName(address);
  if (!name) return null;
  const state = stateAbbreviation(address);
  return state ? `${name} ${state}` : name;
}

function streetName(address: GeocoderAddress): string | null {
  const road = address.road || address.pedestrian || address.footway || address.path;
  const trimmed = road?.trim();
  return trimmed || null;
}

export function formatAustralianAddress(address: GeocoderAddress): string | null {
  const number = address.house_number?.trim();
  const road = streetName(address);
  if (!number || !road) return null;
  const street = `${formatHouseNumber(number)} ${abbreviateStreet(road)}`;
  const tail = [localityName(address), stateAbbreviation(address), address.postcode?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return tail ? `${street}, ${tail}` : street;
}

/**
 * Rebuild an Australian address from a Nominatim `display_name` when the
 * structured `address` object is missing. Returns null for places that are
 * not house-number addresses.
 */
export function formatDisplayName(display: string): string | null {
  const parts = display
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || !/\d/.test(parts[0]) || !/[A-Za-z]/.test(parts[1])) return null;
  const [number, road] = parts;
  const postcode = parts.find((part) => /^\d{4}$/.test(part));
  const state = parts.find((part) => STATE_ABBR[part.toLowerCase()] != null);
  const skip = new Set([number, road, postcode, state, "Australia"]);
  const suburb = parts.find((part) => !skip.has(part));
  return formatAustralianAddress({
    house_number: number,
    road,
    suburb,
    state,
    postcode,
  });
}

export function labelFromGeocoder(row: GeocoderRow): string {
  if (row.address) {
    const formatted = formatAustralianAddress(row.address);
    if (formatted) return formatted;
  }
  if (row.display_name) {
    const formatted = formatDisplayName(row.display_name);
    if (formatted) return formatted;
  }
  if (row.name?.trim()) return row.name.trim();
  if (row.address) {
    const locality = formatLocality(row.address);
    if (locality) return locality;
  }
  return row.display_name?.trim() || "Place";
}

export function coordinateLabel(lat: number, lon: number): string {
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function cutSizeLabel(sideM: number, frameShape: "square" | "circle" = "square"): string {
  const metres = Math.round(sideM);
  if (frameShape === "circle") return `${metres} m diameter`;
  return `${metres} × ${metres} m`;
}

export function cutFrameLabelKm(sideKm: number, frameShape: "square" | "circle" = "square"): string {
  const km = formatKmSide(sideKm);
  if (frameShape === "circle") return `${km} km ø`;
  return `${km} × ${km} km`;
}

export type PlaceAnchor = LonLat & { label: string };

export function resolveSearchedCut(
  camera: LonLat,
  anchor: PlaceAnchor | null,
  sideM: number,
  flyLanded: boolean,
): { center: LonLat; label: string | null } {
  const center = anchor && !flyLanded ? { lat: anchor.lat, lon: anchor.lon } : { lat: camera.lat, lon: camera.lon };
  const label = anchor && addressStillApplies(anchor, center, sideM) ? anchor.label : null;
  return { center, label };
}

export function addressStillApplies(anchor: LonLat, center: LonLat, sideM: number): boolean {
  const dx = (center.lon - anchor.lon) * mPerDegLon(center.lat);
  const dy = (center.lat - anchor.lat) * M_PER_DEG_LAT;
  if (Math.hypot(dx, dy) > MOVED_AWAY_M) return false;
  const half = sideM / 2;
  return Math.abs(dx) <= half && Math.abs(dy) <= half;
}

export function slugifyPlace(label: string, maxLength = 48): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const boundary = cut.lastIndexOf("-");
  const trimmed = boundary > 12 ? cut.slice(0, boundary) : cut;
  return trimmed.replace(/-+$/g, "");
}
