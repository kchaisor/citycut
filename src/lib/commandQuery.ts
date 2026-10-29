import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";

export type ParsedCommandQuery = {
  placeQuery: string;
  sideKm: number | null;
  sideClamped: boolean;
};

const TRAILING_DISTANCE =
  /\s+(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\s*$/i;

function clampSideKm(km: number): number {
  return Math.min(MAX_SIDE_KM, Math.max(MIN_SIDE_KM, km));
}

function requestedSideKm(value: number, unit: string): number {
  return unit.toLowerCase().startsWith("k") ? value : value / 1000;
}

export function parseCommandQuery(raw: string): ParsedCommandQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { placeQuery: "", sideKm: null, sideClamped: false };
  const match = trimmed.match(TRAILING_DISTANCE);
  if (!match || match.index === undefined) {
    return { placeQuery: trimmed, sideKm: null, sideClamped: false };
  }
  const placeQuery = trimmed.slice(0, match.index).trim();
  const requested = requestedSideKm(Number(match[1]), match[2]!);
  const sideKm = clampSideKm(requested);
  return { placeQuery, sideKm, sideClamped: sideKm !== requested };
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
