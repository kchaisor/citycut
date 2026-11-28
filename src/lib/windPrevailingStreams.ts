import { SECTOR_LABELS, WIND_SECTOR_COUNT, sectorCenterDeg, type WindPeriodStats } from "./windRose";
import { WIND_SPEED_BIN_EDGES_MS } from "./windRoseData";

export const PREVAILING_STREAM_COUNT = 3;
export const PREVAILING_STREAM_MIN_SHARE = 1 / WIND_SECTOR_COUNT;
export const PREVAILING_STREAM_MIN_LEAD_RATIO = 0.25;
export const PREVAILING_STREAM_ARROW_CAPS = [5, 4, 3] as const;
export const PREVAILING_STREAM_MIN_ARROWS = 3;
export const PREVAILING_STREAM_MAX_ARROWS = 12;
export const PREVAILING_STREAM_TOKENS = ["--wind-stream-1", "--wind-stream-2", "--wind-stream-3"] as const;

export type PrevailingStreamToken = (typeof PREVAILING_STREAM_TOKENS)[number];

export type PrevailingStream = {
  rank: number;
  sector: number;
  label: string;
  fromDeg: number;
  share: number;
  meanSpeedMs: number;
  arrows: number;
  reach: number;
  token: PrevailingStreamToken;
  legend: string;
};

export type PrevailingStreamDesignWind = { sector: number; stationMs: number };

// The wind asset closes its fastest bin at 100 m/s, so a plain mid-point would count every gale as 55 m/s.
function binMidMs(band: number, edges: readonly number[]): number {
  const lo = edges[band] ?? 0;
  const last = band >= edges.length - 2;
  if (!last) return (lo + edges[band + 1]!) / 2;
  const below = edges[band - 1] ?? 0;
  return lo + (lo - below) / 2;
}

export function sectorMeanSpeedMs(bins: readonly number[] | undefined, edges: readonly number[] = WIND_SPEED_BIN_EDGES_MS): number {
  if (!bins) return 0;
  let weighted = 0;
  let mass = 0;
  bins.forEach((frac, band) => {
    if (frac <= 0) return;
    weighted += frac * binMidMs(band, edges);
    mass += frac;
  });
  return mass > 0 ? weighted / mass : 0;
}

export function prevailingStreamLegend(label: string, meanSpeedMs: number): string {
  return `From ${label} · ${meanSpeedMs.toFixed(1)} m/s`;
}

function stream(rank: number, sector: number, share: number, meanSpeedMs: number, arrows: number, reach: number): PrevailingStream {
  const label = SECTOR_LABELS[sector] ?? "?";
  return {
    rank,
    sector,
    label,
    fromDeg: sectorCenterDeg(sector),
    share,
    meanSpeedMs,
    arrows,
    reach,
    token: PREVAILING_STREAM_TOKENS[rank]!,
    legend: prevailingStreamLegend(label, meanSpeedMs),
  };
}

export function prevailingStreams(
  stats: WindPeriodStats | null,
  designWind: PrevailingStreamDesignWind | null = null,
): PrevailingStream[] {
  if (!stats) return [];
  if (designWind) {
    const share = stats.sectorFrequency[designWind.sector] ?? 0;
    return [stream(0, designWind.sector, share, designWind.stationMs, PREVAILING_STREAM_ARROW_CAPS[0], 1)];
  }
  const edges = stats.speedBinEdgesMs ?? WIND_SPEED_BIN_EDGES_MS;
  const ranked = stats.sectorFrequency
    .map((share, sector) => ({ sector, share, speed: sectorMeanSpeedMs(stats.sectorSpeedBins?.[sector], edges) }))
    .filter((entry) => entry.share > 0)
    .sort((a, b) => b.share - a.share || b.speed - a.speed || a.sector - b.sector);
  const lead = ranked[0];
  if (!lead) return [];
  const kept = ranked
    .slice(0, PREVAILING_STREAM_COUNT)
    .filter(
      (entry, rank) =>
        rank === 0 ||
        (entry.share >= PREVAILING_STREAM_MIN_SHARE && entry.share >= lead.share * PREVAILING_STREAM_MIN_LEAD_RATIO),
    );
  const topSpeed = Math.max(...kept.map((entry) => entry.speed), 0.1);
  return kept.map((entry, rank) => {
    const shareRatio = entry.share / lead.share;
    const arrows = Math.min(
      PREVAILING_STREAM_ARROW_CAPS[rank]!,
      Math.max(PREVAILING_STREAM_MIN_ARROWS, Math.round(2 + 3 * shareRatio)),
    );
    const reach = rank === 0 ? 1 : Math.min(0.88, 0.5 + 0.5 * (0.6 * shareRatio + 0.4 * (entry.speed / topSpeed)));
    return stream(rank, entry.sector, entry.share, entry.speed, arrows, reach);
  });
}
