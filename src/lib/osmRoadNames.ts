import { pointToSegmentDistanceM } from "./semanticHudGeometry";
import type { LonLat, Pt, RoadFeat } from "../types";
import type { SiteFrameShape } from "./siteFrame";

const OSM_API_WAYS_URL = "https://api.openstreetmap.org/api/0.6/ways";
const OSM_API_USER_AGENT = "CityCut/0.1 (https://kchaisor.github.io/citycut/; road names)";
const OSM_WAY_BATCH_SIZE = 45;
const OSM_WAY_BATCH_GAP_MS = 1100;

export type OsmNamedRoadPart = { name: string; line: Pt[] };

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function decodeOsmXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseOsmWayNamesXml(xml: string): Map<string, string> {
  const names = new Map<string, string>();
  const wayBlocks = xml.match(/<way id="\d+"[\s\S]*?<\/way>/g) ?? [];
  for (const block of wayBlocks) {
    const idMatch = block.match(/<way id="(\d+)"/);
    const nameMatch = block.match(/<tag k="name" v="([^"]+)"/);
    if (!idMatch || !nameMatch) continue;
    names.set(`w${idMatch[1]}`, decodeOsmXml(nameMatch[1]!));
  }
  return names;
}

export async function fetchOsmWayNamesByIds(
  wayKeys: string[],
  options: { signal?: AbortSignal } = {},
): Promise<{ names: Map<string, string>; note: string | null }> {
  const ids = [...new Set(wayKeys.map((key) => key.replace(/^w/i, "")).filter((id) => /^\d+$/.test(id)))];
  if (ids.length === 0) return { names: new Map(), note: null };
  const names = new Map<string, string>();
  let lastStatus = 0;
  try {
    for (let offset = 0; offset < ids.length; offset += OSM_WAY_BATCH_SIZE) {
      if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
      const batch = ids.slice(offset, offset + OSM_WAY_BATCH_SIZE);
      const url = `${OSM_API_WAYS_URL}?ways=${batch.join(",")}`;
      const response = await fetch(url, {
        signal: options.signal,
        headers: { "User-Agent": OSM_API_USER_AGENT },
      });
      lastStatus = response.status;
      if (response.status === 429) {
        return { names, note: "OpenStreetMap road names: API rate limited (HTTP 429)." };
      }
      if (response.status < 200 || response.status >= 300) {
        return { names, note: `OpenStreetMap road names: API HTTP ${response.status}.` };
      }
      const xml = await response.text();
      for (const [key, name] of parseOsmWayNamesXml(xml)) names.set(key, name);
      if (offset + OSM_WAY_BATCH_SIZE < ids.length) await sleepMs(OSM_WAY_BATCH_GAP_MS, options.signal);
    }
    if (names.size === 0) {
      return { names, note: lastStatus ? `OpenStreetMap road names: API HTTP ${lastStatus}.` : null };
    }
    return { names, note: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { names, note: "OpenStreetMap road names: request failed." };
  }
}

export function applyOsmWayIdNamesToRoads(roads: RoadFeat[], names: Map<string, string>): RoadFeat[] {
  if (names.size === 0) return roads;
  return roads.map((road) => {
    if (road.name || !road.osmWayKey) return road;
    const name = names.get(road.osmWayKey);
    if (!name) return road;
    return { ...road, name };
  });
}

function roadMidpoint(line: Pt[]): Pt {
  const mid = Math.floor(line.length / 2);
  return line[mid] ?? line[0]!;
}

function nearestOsmNameAt(parts: OsmNamedRoadPart[], at: Pt): string | null {
  let best: { name: string; dist: number } | null = null;
  for (const part of parts) {
    const line = part.line;
    for (let i = 0; i < line.length - 1; i++) {
      const dist = pointToSegmentDistanceM(at, line[i]!, line[i + 1]!);
      if (dist > 14) continue;
      if (!best || dist < best.dist) best = { name: part.name, dist };
    }
  }
  return best?.name ?? null;
}

export function applyOsmRoadNamesToRoads(roads: RoadFeat[], osmParts: OsmNamedRoadPart[]): RoadFeat[] {
  if (osmParts.length === 0) return roads;
  return roads.map((road) => {
    if (road.name || road.kind !== "road" || road.grade === "path" || road.service) return road;
    const name = nearestOsmNameAt(osmParts, roadMidpoint(road.line));
    if (!name) return road;
    return { ...road, name };
  });
}

export async function fetchOsmNamedRoadPartsForCut(
  center: LonLat,
  sideM: number,
  options: { frameShape?: SiteFrameShape } = {},
): Promise<{ parts: OsmNamedRoadPart[]; note: string | null }> {
  void center;
  void sideM;
  void options;
  return { parts: [], note: null };
}
