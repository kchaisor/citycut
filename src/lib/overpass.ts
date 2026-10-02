import type { ModelLayers } from "../types";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
};

export type OverpassResponse = {
  elements: OverpassElement[];
  remark?: string;
};

const DEFAULT_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export class OverpassError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverpassError";
  }
}

export function overpassBBox(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}): string {
  const n = (value: number) => value.toFixed(6);
  return `(${n(bounds.south)},${n(bounds.west)},${n(bounds.north)},${n(bounds.east)})`;
}

export function buildOverpassQuery(bbox: string, layers: ModelLayers): string {
  const parts: string[] = [];
  if (layers.buildings || layers.trees) {
    parts.push(`way["building"]["building"!="no"]${bbox};`);
    parts.push(`relation["building"]["building"!="no"]${bbox};`);
  }
  if (layers.roads || layers.trees) {
    parts.push(`way["highway"]${bbox};`);
    parts.push(`way["railway"~"^(rail|light_rail|tram|subway|narrow_gauge)$"]${bbox};`);
  }
  if (layers.trees) {
    parts.push(`node["natural"="tree"]${bbox};`);
    parts.push(`way["natural"="tree"]${bbox};`);
    parts.push(`way["natural"="tree_row"]${bbox};`);
    parts.push(`relation["natural"="scrub"]${bbox};`);
    if (!layers.waterGreen) {
      parts.push(`way["natural"="wood"]${bbox};`);
      parts.push(`way["natural"="scrub"]${bbox};`);
      parts.push(`way["landuse"="forest"]${bbox};`);
      parts.push(`relation["natural"="wood"]${bbox};`);
      parts.push(`relation["landuse"="forest"]${bbox};`);
      parts.push(`way["natural"="water"]${bbox};`);
      parts.push(`way["waterway"~"^(riverbank|dock)$"]${bbox};`);
      parts.push(`way["landuse"="reservoir"]${bbox};`);
      parts.push(`relation["natural"="water"]${bbox};`);
    }
  }
  if (layers.waterGreen) {
    parts.push(`way["natural"="water"]${bbox};`);
    parts.push(`way["waterway"~"^(riverbank|dock)$"]${bbox};`);
    parts.push(`way["landuse"="reservoir"]${bbox};`);
    parts.push(`way["natural"~"^(wood|scrub|wetland)$"]${bbox};`);
    parts.push(`way["leisure"~"^(park|garden|nature_reserve|pitch)$"]${bbox};`);
    parts.push(
      `way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|cemetery)$"]${bbox};`,
    );
    parts.push(`relation["natural"="water"]${bbox};`);
    parts.push(`relation["leisure"~"^(park|garden|nature_reserve)$"]${bbox};`);
    parts.push(
      `relation["landuse"~"^(forest|grass|meadow|recreation_ground|village_green)$"]${bbox};`,
    );
    parts.push(`relation["natural"~"^(wood|wetland)$"]${bbox};`);
  }
  if (parts.length === 0) {
    throw new OverpassError("Turn on Buildings, Roads and rail, Water and green, or Trees.");
  }
  return `[out:json][timeout:60][maxsize:32000000];(${parts.join("")});out geom;`;
}

function endpoints(): string[] {
  const custom = import.meta.env.VITE_OVERPASS_URL?.trim();
  if (!custom) return DEFAULT_ENDPOINTS;
  return [custom, ...DEFAULT_ENDPOINTS.filter((url) => url !== custom)];
}

const MIRROR_TIMEOUT_MS = 70_000;

export async function fetchOverpass(
  query: string,
  signal?: AbortSignal,
): Promise<OverpassResponse> {
  let lastError = "OpenStreetMap did not return this block.";
  for (const url of endpoints()) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MIRROR_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = `The map service was busy (${response.status}).`;
        continue;
      }
      if (!response.ok) {
        lastError = `The map service answered ${response.status}.`;
        continue;
      }
      const json = (await response.json()) as OverpassResponse;
      if (json.remark && /error|timed out|runtime/i.test(json.remark)) {
        lastError = "The map query timed out. Try a smaller frame.";
        continue;
      }
      if (!Array.isArray(json.elements)) {
        lastError = "The map service returned an unexpected response.";
        continue;
      }
      return json;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = controller.signal.aborted
        ? "The map service was busy."
        : "The map service could not be reached.";
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new OverpassError(
    `${lastError} Try again in a moment, or move the frame slightly.`,
  );
}
