import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";

export type ParsedCommandQuery = {
  placeQuery: string;
  sideKm: number | null;
};

const TRAILING_DISTANCE =
  /\s+(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\s*$/i;

function clampSideKm(km: number): number {
  return Math.min(MAX_SIDE_KM, Math.max(MIN_SIDE_KM, km));
}

function sideKmFromMatch(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("k")) return clampSideKm(value);
  return clampSideKm(value / 1000);
}

/** Split a command-bar query into a place string and an optional cut square side (e.g. "Fed Square 200m"). */
export function parseCommandQuery(raw: string): ParsedCommandQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { placeQuery: "", sideKm: null };
  const match = trimmed.match(TRAILING_DISTANCE);
  if (!match || match.index === undefined) {
    return { placeQuery: trimmed, sideKm: null };
  }
  const placeQuery = trimmed.slice(0, match.index).trim();
  const sideKm = sideKmFromMatch(Number(match[1]), match[2]!);
  return { placeQuery, sideKm };
}

export function filterCommandTools<T extends { label: string; keywords: readonly string[] }>(
  query: string,
  tools: readonly T[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tools];
  return tools.filter((tool) => {
    if (tool.label.toLowerCase().includes(q)) return true;
    return tool.keywords.some((word) => word.toLowerCase().includes(q) || q.includes(word.toLowerCase()));
  });
}
