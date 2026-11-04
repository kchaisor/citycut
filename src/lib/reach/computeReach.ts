import { REACH_HEX_AREA_KM2, REACH_UNREACHABLE } from "./constants";
import type { ReachAreaStats, ReachCellTimes, ReachDataset, ReachMinuteSeries } from "./types";
import { walkMinutesFromOrigin } from "./walkGraph";

export function computeReachTimes(
  dataset: ReachDataset,
  originIndex: number,
  period: keyof ReachDataset["ptMinutes"],
  maxMin: number,
): ReachCellTimes {
  const n = dataset.h3Indices.length;
  const walkMin = walkMinutesFromOrigin(dataset, originIndex, maxMin);
  const combinedMin = new Uint8Array(n);
  combinedMin.fill(REACH_UNREACHABLE);
  const ptTable = dataset.ptMinutes[period];
  for (let c = 0; c < n; c++) {
    let bestWalk = walkMin[c]!;
    if (bestWalk >= REACH_UNREACHABLE) bestWalk = REACH_UNREACHABLE;
    let best = bestWalk;
    for (let s = 0; s < dataset.stations.length; s++) {
      const stationCell = dataset.stations[s]!.cellIndex;
      const toStation = walkMin[stationCell]!;
      if (toStation >= REACH_UNREACHABLE) continue;
      const leg = ptTable[s * n + c]!;
      if (leg >= REACH_UNREACHABLE) continue;
      const total = toStation + leg;
      if (total < best) best = total;
    }
    if (best >= REACH_UNREACHABLE) {
      combinedMin[c] = REACH_UNREACHABLE;
      continue;
    }
    combinedMin[c] = Math.min(REACH_UNREACHABLE - 1, Math.ceil(best));
  }
  return { walkMin, combinedMin };
}

export function classifyPtOnly(walkMin: Uint8Array, combinedMin: Uint8Array, budget: number): boolean[] {
  const n = walkMin.length;
  const ptOnly = new Array<boolean>(n).fill(false);
  for (let c = 0; c < n; c++) {
    const combined = combinedMin[c]!;
    if (combined > budget || combined >= REACH_UNREACHABLE) continue;
    const walk = walkMin[c]!;
    ptOnly[c] = walk > budget || walk >= REACH_UNREACHABLE;
  }
  return ptOnly;
}

function walkHexCount(walk: Uint8Array, budget: number): number {
  let n = 0;
  for (let i = 0; i < walk.length; i++) {
    const t = walk[i]!;
    if (t <= budget && t < REACH_UNREACHABLE) n++;
  }
  return n;
}

function combinedHexCount(combined: Uint8Array, budget: number): number {
  let n = 0;
  for (let i = 0; i < combined.length; i++) {
    const t = combined[i]!;
    if (t <= budget && t < REACH_UNREACHABLE) n++;
  }
  return n;
}

export function reachAreaStats(
  dataset: ReachDataset,
  times: ReachCellTimes,
  budget: number,
): ReachAreaStats {
  const walkHexes = walkHexCount(times.walkMin, budget);
  const transitHexes = combinedHexCount(times.combinedMin, budget);
  const walkKm2 = walkHexes * REACH_HEX_AREA_KM2;
  const transitKm2 = transitHexes * REACH_HEX_AREA_KM2;
  const walkRadiusKm = walkHexes > 0 ? Math.sqrt(walkKm2 / Math.PI) : 0;
  const stationIds = new Set<number>();
  let tramLines = 0;
  for (const station of dataset.stations) {
    const t = times.combinedMin[station.cellIndex]!;
    if (t <= budget && t < REACH_UNREACHABLE) stationIds.add(station.cellIndex);
    if (station.modes.includes("tram")) tramLines += 1;
  }
  const transitMultiplier = walkKm2 > 0.01 ? transitKm2 / walkKm2 : 1;
  const series = reachMinuteSeries(times, budget);
  let insightMinute = 6;
  let insightKm2PerMin = 0.4;
  for (let m = 1; m < series.minutes.length; m++) {
    const dWalk = series.walkCumulativeKm2[m]! - series.walkCumulativeKm2[m - 1]!;
    const dPt = series.transitExtraKm2[m]! - series.transitExtraKm2[m - 1]!;
    if (dPt > dWalk + 0.05) {
      insightMinute = m;
      insightKm2PerMin = Math.max(0.1, dPt - dWalk);
      break;
    }
  }
  return {
    walkKm2,
    walkHexes,
    walkRadiusKm,
    transitKm2,
    transitHexes,
    stationCount: stationIds.size,
    tramLineCount: Math.min(tramLines, 99),
    transitMultiplier,
    insightMinute,
    insightKm2PerMin,
  };
}

export function reachMinuteSeries(times: ReachCellTimes, budgetMax: number): ReachMinuteSeries {
  const minutes: number[] = [];
  const walkCumulativeKm2: number[] = [];
  const transitExtraKm2: number[] = [];
  for (let m = 0; m <= budgetMax; m++) {
    minutes.push(m);
    const walkKm2 = walkHexCount(times.walkMin, m) * REACH_HEX_AREA_KM2;
    const combinedKm2 = combinedHexCount(times.combinedMin, m) * REACH_HEX_AREA_KM2;
    walkCumulativeKm2.push(walkKm2);
    transitExtraKm2.push(Math.max(0, combinedKm2 - walkKm2));
  }
  return { minutes, walkCumulativeKm2, transitExtraKm2 };
}

export function nearestCellIndex(dataset: ReachDataset, lat: number, lng: number): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < dataset.lat.length; i++) {
    const dlat = dataset.lat[i]! - lat;
    const dlng = dataset.lng[i]! - lng;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
