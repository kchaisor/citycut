import { useCallback, useEffect, useMemo, useState } from "react";
import type { CityModel } from "../types";
import { sectorCenterDeg, sectorIndex, sectorLabel, WIND_SECTOR_COUNT, type WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection, WindRoseSeasonId } from "../lib/windRoseData";
import type { DesignWind, DesignWindId } from "../lib/windDesignWinds";
import { seasonRecord } from "../lib/windRoseStats";
import { windSeasonWeights, type WindSeasonWeights } from "../lib/windComfort";
import {
  cachedWindPlanComfort,
  cachedWindPlanScale,
  cachedWindPlanSpeed,
  createWindPlanComfortJob,
  createWindPlanScaleJob,
  createWindPlanSpeedJob,
  windPlanReferenceMs,
  windPlanScaleKey,
  windPlanSpeedKey,
  type WindPlanComfort,
  type WindPlanJob,
  type WindPlanMode,
  type WindPlanSpeed,
  type WindPlanView,
} from "../lib/windPlanField";

declare global {
  interface Window {
    __citycutWindPlan?: {
      readonly mode: WindPlanMode;
      readonly vectors: boolean;
      readonly season: WindPeriodId | DesignWindId;
      readonly dirDeg: number | null;
      readonly referenceMs: number | null;
      readonly scaleMaxMs: number | null;
      readonly ready: boolean;
      readonly unsafeAreas: number | null;
    };
  }
}

const SLICE_BUDGET_MS = 8;
const NO_DESIGN_WINDS: readonly DesignWind[] = [];

export type WindPlanState = {
  active: boolean;
  mode: WindPlanMode;
  setMode: (mode: WindPlanMode) => void;
  vectorsOn: boolean;
  setVectorsOn: (on: boolean) => void;
  sector: number | null;
  designWind: DesignWind | null;
  dirLabel: string;
  selectSector: (sector: number) => void;
  stepSector: (delta: number) => void;
  sectorReferenceMs: (sector: number) => number | null;
  referenceMs: number | null;
  hasData: boolean;
  ready: boolean;
  scaleMaxMs: number | null;
  speed: WindPlanSpeed | null;
  comfort: WindPlanComfort | null;
};

function seasonKey(siteWind: SiteWindSelection, period: WindPeriodId | DesignWindId): string {
  return `${siteWind.station.id}:${period}`;
}

const SCALE_SEASONS: readonly WindRoseSeasonId[] = ["annual", "summer", "autumn", "winter", "spring"];

export function windPlanScaleViews(siteWind: SiteWindSelection, designWinds: readonly DesignWind[]): WindPlanView[] {
  const views: WindPlanView[] = [];
  for (const season of SCALE_SEASONS) {
    const record = seasonRecord(siteWind, season);
    if (!record) continue;
    const sector = sectorIndex(record.prevailingDirDeg);
    const referenceMs = windPlanReferenceMs(windSeasonWeights(record, siteWind.asset.speedBinEdgesMs), sector);
    if (referenceMs != null) views.push({ sector, referenceMs });
  }
  for (const wind of designWinds) views.push({ sector: wind.sector, referenceMs: wind.referenceMs });
  return views;
}

function runJobs(jobs: Array<WindPlanJob<unknown>>, onDone: () => void): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    timer = null;
    if (cancelled) return;
    const start = performance.now();
    while (jobs.length > 0 && performance.now() - start < SLICE_BUDGET_MS) {
      const job = jobs[0]!;
      if (job.step(SLICE_BUDGET_MS - (performance.now() - start))) {
        jobs.shift();
        onDone();
      }
    }
    if (jobs.length > 0) timer = setTimeout(tick, 0);
  };
  timer = setTimeout(tick, 0);
  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}

export function useWindPlan({
  model,
  siteWind,
  period,
  designWind = null,
  designWinds = NO_DESIGN_WINDS,
  clearDesignWind,
  active,
}: {
  model: CityModel;
  siteWind: SiteWindSelection | null;
  period: WindPeriodId;
  designWind?: DesignWind | null;
  designWinds?: readonly DesignWind[];
  clearDesignWind?: () => void;
  active: boolean;
}): WindPlanState {
  const [mode, setMode] = useState<WindPlanMode>("speed");
  const [vectorsOn, setVectorsOn] = useState(true);
  const [override, setOverride] = useState<{ period: WindPeriodId; sector: number } | null>(null);
  const [revision, setRevision] = useState(0);

  const weights = useMemo<WindSeasonWeights | null>(() => {
    if (!siteWind) return null;
    const record = seasonRecord(siteWind, period);
    return record ? windSeasonWeights(record, siteWind.asset.speedBinEdgesMs) : null;
  }, [siteWind, period]);

  const prevailing = useMemo(() => {
    if (!siteWind) return null;
    const record = seasonRecord(siteWind, period);
    return record ? sectorIndex(record.prevailingDirDeg) : null;
  }, [siteWind, period]);

  const scaleViews = useMemo(() => (siteWind ? windPlanScaleViews(siteWind, designWinds) : []), [siteWind, designWinds]);
  const scaleKey = windPlanScaleKey(scaleViews);

  const sector = designWind ? designWind.sector : override && override.period === period ? override.sector : prevailing;
  const key = siteWind ? seasonKey(siteWind, period) : null;
  const speedKey = siteWind && designWind ? seasonKey(siteWind, designWind.id) : key;
  const referenceMs = designWind
    ? designWind.referenceMs
    : weights && sector != null
      ? windPlanReferenceMs(weights, sector)
      : null;

  const selectSector = useCallback(
    (next: number) => {
      if (designWind) clearDesignWind?.();
      setOverride({ period, sector: (((next % WIND_SECTOR_COUNT) + WIND_SECTOR_COUNT) % WIND_SECTOR_COUNT) });
    },
    [period, designWind, clearDesignWind],
  );

  const stepSector = useCallback(
    (delta: number) => {
      if (sector != null) selectSector(sector + delta);
    },
    [sector, selectSector],
  );

  const sectorReferenceMs = useCallback(
    (at: number) => (weights ? windPlanReferenceMs(weights, at) : null),
    [weights],
  );

  const scaleMaxMs = active && scaleViews.length > 0 ? cachedWindPlanScale(model, scaleKey) : null;
  const speed =
    active && speedKey && sector != null && scaleMaxMs != null
      ? cachedWindPlanSpeed(model, windPlanSpeedKey(speedKey, sector))
      : null;
  const comfort = active && key ? cachedWindPlanComfort(model, key) : null;

  useEffect(() => {
    if (!active || !key || !speedKey || !weights) return;
    const jobs: Array<WindPlanJob<unknown>> = [];
    const speedJob = sector != null ? createWindPlanSpeedJob(model, speedKey, referenceMs, sector) : null;
    const scaleJob = scaleViews.length > 0 ? createWindPlanScaleJob(model, scaleViews) : null;
    const comfortJob = createWindPlanComfortJob(model, key, weights);
    const first = mode === "comfort" ? [comfortJob, speedJob, scaleJob] : [speedJob, scaleJob, comfortJob];
    for (const job of first) if (job && !job.result()) jobs.push(job);
    if (jobs.length === 0) return;
    return runJobs(jobs, () => setRevision((r) => r + 1));
  }, [active, key, speedKey, weights, sector, referenceMs, mode, model, scaleViews]);

  const hasData = weights != null && weights.bins.length > 0;
  const ready = mode === "speed" ? speed != null || (hasData && referenceMs == null) : comfort != null;

  useEffect(() => {
    if (!active) return;
    window.__citycutWindPlan = {
      mode,
      vectors: vectorsOn,
      season: designWind ? designWind.id : period,
      dirDeg: mode === "speed" && sector != null ? sectorCenterDeg(sector) : null,
      referenceMs: mode === "speed" ? referenceMs : null,
      scaleMaxMs,
      ready,
      unsafeAreas: comfort ? comfort.unsafeAreas.length : null,
    };
    return () => {
      delete window.__citycutWindPlan;
    };
  }, [active, mode, vectorsOn, period, designWind, sector, referenceMs, scaleMaxMs, ready, comfort, revision]);

  return {
    active,
    mode,
    setMode,
    vectorsOn,
    setVectorsOn,
    sector,
    designWind,
    dirLabel: mode === "comfort" ? "All" : sector != null ? sectorLabel(sector) : "—",
    selectSector,
    stepSector,
    sectorReferenceMs,
    referenceMs,
    hasData,
    ready,
    scaleMaxMs,
    speed,
    comfort,
  };
}
