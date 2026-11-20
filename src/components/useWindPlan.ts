import { useCallback, useEffect, useMemo, useState } from "react";
import type { CityModel } from "../types";
import { sectorCenterDeg, sectorIndex, sectorLabel, WIND_SECTOR_COUNT, type WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { seasonRecord } from "../lib/windRoseStats";
import { windSeasonWeights, type WindSeasonWeights } from "../lib/windComfort";
import {
  cachedWindPlanComfort,
  cachedWindPlanSpeed,
  createWindPlanComfortJob,
  createWindPlanSpeedJob,
  windPlanReferenceMs,
  windPlanSpeedKey,
  type WindPlanComfort,
  type WindPlanJob,
  type WindPlanMode,
  type WindPlanSpeed,
} from "../lib/windPlanField";

declare global {
  interface Window {
    __citycutWindPlan?: {
      readonly mode: WindPlanMode;
      readonly season: WindPeriodId;
      readonly dirDeg: number | null;
      readonly ready: boolean;
      readonly unsafeAreas: number | null;
    };
  }
}

const SLICE_BUDGET_MS = 8;

export type WindPlanState = {
  active: boolean;
  mode: WindPlanMode;
  setMode: (mode: WindPlanMode) => void;
  sector: number | null;
  dirLabel: string;
  stepSector: (delta: number) => void;
  referenceMs: number | null;
  hasData: boolean;
  ready: boolean;
  speed: WindPlanSpeed | null;
  comfort: WindPlanComfort | null;
};

function seasonKey(siteWind: SiteWindSelection, period: WindPeriodId): string {
  return `${siteWind.station.id}:${period}`;
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
  active,
}: {
  model: CityModel;
  siteWind: SiteWindSelection | null;
  period: WindPeriodId;
  active: boolean;
}): WindPlanState {
  const [mode, setMode] = useState<WindPlanMode>("speed");
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

  const sector = override && override.period === period ? override.sector : prevailing;
  const key = siteWind ? seasonKey(siteWind, period) : null;
  const referenceMs = weights && sector != null ? windPlanReferenceMs(weights, sector) : null;

  const stepSector = useCallback(
    (delta: number) => {
      if (sector == null) return;
      const next = (((sector + delta) % WIND_SECTOR_COUNT) + WIND_SECTOR_COUNT) % WIND_SECTOR_COUNT;
      setOverride({ period, sector: next });
    },
    [sector, period],
  );

  const speed = active && key && sector != null ? cachedWindPlanSpeed(model, windPlanSpeedKey(key, sector)) : null;
  const comfort = active && key ? cachedWindPlanComfort(model, key) : null;

  useEffect(() => {
    if (!active || !key || !weights) return;
    const jobs: Array<WindPlanJob<unknown>> = [];
    const speedJob = sector != null ? createWindPlanSpeedJob(model, key, weights, sector) : null;
    const comfortJob = createWindPlanComfortJob(model, key, weights);
    const first = mode === "comfort" ? [comfortJob, speedJob] : [speedJob, comfortJob];
    for (const job of first) if (job && !job.result()) jobs.push(job);
    if (jobs.length === 0) return;
    return runJobs(jobs, () => setRevision((r) => r + 1));
  }, [active, key, weights, sector, mode, model]);

  const hasData = weights != null && weights.bins.length > 0;
  const ready = mode === "speed" ? speed != null || (hasData && referenceMs == null) : comfort != null;

  useEffect(() => {
    if (!active) return;
    window.__citycutWindPlan = {
      mode,
      season: period,
      dirDeg: mode === "speed" && sector != null ? sectorCenterDeg(sector) : null,
      ready,
      unsafeAreas: comfort ? comfort.unsafeAreas.length : null,
    };
    return () => {
      delete window.__citycutWindPlan;
    };
  }, [active, mode, period, sector, ready, comfort, revision]);

  return {
    active,
    mode,
    setMode,
    sector,
    dirLabel: mode === "comfort" ? "All" : sector != null ? sectorLabel(sector) : "—",
    stepSector,
    referenceMs,
    hasData,
    ready,
    speed,
    comfort,
  };
}
