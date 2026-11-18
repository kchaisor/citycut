import { useEffect, useMemo, useState } from "react";
import type { PlanShadowTreeMode } from "../lib/buildingShadows";
import type { SunStudyWorkerMessage, SunStudyWorkerRequest } from "../lib/sunStudyShadows.worker";
import { SUN_STUDY_HOURS, sunStudyHourKey, sunStudyModelKey, type SunStudyDate } from "../lib/sunStudyPlan";
import type { CityModel, Ring } from "../types";

export type SunStudyLayer = { hour: number; rings: Ring[][]; addedRings: Ring[][] };

type CachedHour = { rings: Ring[][]; addedRings: Ring[][] };

const CACHE_LIMIT = 96;
const hourCache = new Map<string, CachedHour>();

function remember(key: string, value: CachedHour) {
  hourCache.delete(key);
  hourCache.set(key, value);
  while (hourCache.size > CACHE_LIMIT) hourCache.delete(hourCache.keys().next().value!);
}

export function sunStudyCacheSize(): number {
  return hourCache.size;
}

let nextId = 1;

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/sunStudyShadows.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

function studyShadowModelKey(model: CityModel, treeMode: PlanShadowTreeMode): string {
  return `${sunStudyModelKey(model)}|trees:${treeMode}`;
}

export function sunStudyLayersFor(
  model: CityModel,
  date: SunStudyDate,
  treeMode: PlanShadowTreeMode = "off",
): Promise<SunStudyLayer[]> {
  const modelKey = studyShadowModelKey(model, treeMode);
  const collect = () =>
    SUN_STUDY_HOURS.map((hour) => {
      const cached = hourCache.get(sunStudyHourKey(modelKey, date, hour));
      return { hour, rings: cached?.rings ?? [], addedRings: cached?.addedRings ?? [] };
    });
  const missing = SUN_STUDY_HOURS.filter((hour) => !hourCache.has(sunStudyHourKey(modelKey, date, hour)));
  if (missing.length === 0) return Promise.resolve(collect());
  const worker = startWorker();
  if (!worker) return Promise.resolve(collect());
  const id = nextId++;
  return new Promise((resolve, reject) => {
    let left = missing.length;
    worker.onmessage = (event: MessageEvent<SunStudyWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      remember(
        sunStudyHourKey(modelKey, date, message.hour),
        message.type === "hour" ? { rings: message.rings, addedRings: message.addedRings } : { rings: [], addedRings: [] },
      );
      left -= 1;
      if (left === 0) {
        worker.terminate();
        resolve(collect());
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error("The sun study shadows could not be computed."));
    };
    const request: SunStudyWorkerRequest = {
      id,
      model: {
        sideM: model.sideM,
        terrain: model.terrain,
        frameShape: model.frameShape,
        buildings: model.buildings,
        trees: model.trees,
      },
      date: { lat: date.lat, lon: date.lon, year: date.year, month: date.month, day: date.day },
      hours: [...missing],
      treeMode,
    };
    worker.postMessage(request);
  });
}

export function useSunStudyShadows(
  model: CityModel,
  date: SunStudyDate | null,
  treeMode: PlanShadowTreeMode = "off",
): { layers: SunStudyLayer[]; pending: boolean } {
  const modelKey = useMemo(() => studyShadowModelKey(model, treeMode), [model, treeMode]);
  const dateKey = date ? `${date.lat}|${date.lon}|${date.year}|${date.month}|${date.day}` : "";
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!date) return;
    const missing = SUN_STUDY_HOURS.filter((hour) => !hourCache.has(sunStudyHourKey(modelKey, date, hour)));
    if (missing.length === 0) return;
    const worker = startWorker();
    if (!worker) return;
    const id = nextId++;
    worker.onmessage = (event: MessageEvent<SunStudyWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      remember(
        sunStudyHourKey(modelKey, date, message.hour),
        message.type === "hour" ? { rings: message.rings, addedRings: message.addedRings } : { rings: [], addedRings: [] },
      );
      setRevision((value) => value + 1);
    };
    worker.onerror = (event) => {
      event.preventDefault();
    };
    const request: SunStudyWorkerRequest = {
      id,
      model: {
        sideM: model.sideM,
        terrain: model.terrain,
        frameShape: model.frameShape,
        buildings: model.buildings,
        trees: model.trees,
      },
      date: { lat: date.lat, lon: date.lon, year: date.year, month: date.month, day: date.day },
      hours: [...missing],
      treeMode,
    };
    worker.postMessage(request);
    return () => worker.terminate();
    // dateKey covers date's fields; model is covered by modelKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, dateKey, treeMode]);

  return useMemo(() => {
    if (!date) return { layers: [], pending: false };
    const layers: SunStudyLayer[] = [];
    let pending = false;
    for (const hour of SUN_STUDY_HOURS) {
      const cached = hourCache.get(sunStudyHourKey(modelKey, date, hour));
      if (cached) layers.push({ hour, rings: cached.rings, addedRings: cached.addedRings });
      else pending = true;
    }
    return { layers, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, dateKey, revision]);
}
