import { sectorCenterDeg, sectorIndex, sectorLabel, SECTOR_LABELS, WIND_SECTOR_COUNT, type WindPeriodStats } from "./windRose";
import type { SiteWindSelection, WindRoseSeasonRecord } from "./windRoseData";
import { seasonRecord } from "./windRoseStats";
import { pedestrianReferenceMs } from "./windPlanField";

export type DesignWindId = `design-${string}`;

export type DesignWind = {
  id: DesignWindId;
  label: string;
  headingDeg: number;
  sector: number;
  stationMs: number;
  referenceMs: number;
  sharePct: number;
};

export const DESIGN_WIND_MIN_SEPARATION_DEG = 67.5;
const DESIGN_WIND_COUNT = 3;
const COMPASS_8_SECTORS = [0, 2, 4, 6, 8, 10, 12, 14];

// Pyrmont and Blackwattle Bay pedestrian wind studies (Windtech WD758-22F01, June 2022; CPP Project 9079,
// Jan 2020) assess the three Sydney Airport design winds: north-east, south and west.
const REGIONAL_DESIGN_HEADINGS: Readonly<Record<string, readonly number[]>> = {
  "947670": [45, 180, 270],
};

export function isDesignWindId(value: string | null | undefined): value is DesignWindId {
  return typeof value === "string" && /^design-[a-z]{1,3}$/.test(value);
}

export function designWindId(label: string): DesignWindId {
  return `design-${label.toLowerCase()}`;
}

function windowSectors(sector: number): number[] {
  return [-1, 0, 1].map((d) => (sector + d + WIND_SECTOR_COUNT) % WIND_SECTOR_COUNT);
}

function sectorFrequency(record: WindRoseSeasonRecord, sector: number): number {
  return (record.sectors[sector] ?? []).reduce((a, b) => a + b, 0);
}

export function designWindWindow(
  record: WindRoseSeasonRecord,
  sector: number,
): { stationMs: number; share: number; energy: number } {
  const means = record.sectorMeanSpeedMs ?? [];
  let share = 0;
  let speedSum = 0;
  let energy = 0;
  for (const s of windowSectors(sector)) {
    const freq = sectorFrequency(record, s);
    const mean = means[s] ?? 0;
    share += freq;
    speedSum += freq * mean;
    energy += freq * mean ** 3;
  }
  return { stationMs: share > 0 ? speedSum / share : 0, share, energy };
}

function circularGapDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export function dataDrivenDesignSectors(record: WindRoseSeasonRecord): number[] {
  const ranked = [...COMPASS_8_SECTORS].sort(
    (a, b) => designWindWindow(record, b).energy - designWindWindow(record, a).energy,
  );
  const picked: number[] = [];
  for (const sector of ranked) {
    if (picked.length >= DESIGN_WIND_COUNT) break;
    if (designWindWindow(record, sector).energy <= 0) break;
    const heading = sectorCenterDeg(sector);
    if (picked.every((p) => circularGapDeg(sectorCenterDeg(p), heading) >= DESIGN_WIND_MIN_SEPARATION_DEG)) {
      picked.push(sector);
    }
  }
  return picked.sort((a, b) => a - b);
}

export function designWindsFor(selection: SiteWindSelection): DesignWind[] {
  const record = seasonRecord(selection, "annual");
  if (!record?.sectorMeanSpeedMs?.length) return [];
  const regional = REGIONAL_DESIGN_HEADINGS[selection.station.id];
  const sectors = regional ? regional.map(sectorIndex) : dataDrivenDesignSectors(record);
  return sectors.map((sector) => {
    const { stationMs, share } = designWindWindow(record, sector);
    const label = SECTOR_LABELS[sector]!;
    return {
      id: designWindId(label),
      label,
      headingDeg: sectorCenterDeg(sector),
      sector,
      stationMs,
      referenceMs: pedestrianReferenceMs(stationMs),
      sharePct: share * 100,
    };
  });
}

export function findDesignWind(winds: readonly DesignWind[], id: DesignWindId | null | undefined): DesignWind | null {
  return id ? (winds.find((w) => w.id === id) ?? null) : null;
}

export function designWindPeriodStats(stats: WindPeriodStats, wind: DesignWind): WindPeriodStats {
  return {
    ...stats,
    prevailingSector: wind.sector,
    prevailingLabel: sectorLabel(wind.sector),
    prevailingMeanSpeedMs: wind.stationMs,
    prevailingMedianKmh: wind.stationMs * 3.6,
  };
}
