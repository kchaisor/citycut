import { useEffect, useMemo, useState } from "react";
import type { SunStudyWorkerMessage, SunStudyWorkerRequest } from "../lib/sunStudyShadows.worker";
import { SUN_STUDY_HOURS, sunStudyHourKey, sunStudyModelKey, type SunStudyDate } from "../lib/sunStudyPlan";
import type { CityModel, Ring } from "../types";

export type SunStudyLayer = { hour: number; rings: Ring[][] };

const CACHE_LIMIT = 96;
/** Per-hour shadow cache shared by every plan: key = model geometry + date + hour. */
const hourCache = new Map<string, Ring[][]>();

function remember(key: string, rings: Ring[][]) {
  hourCache.delete(key);
  hourCache.set(key, rings);
  while (hourCache.size > CACHE_LIMIT) hourCache.delete(hourCache.keys().next().value!);
}

/** @internal test helper */
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

/**
 * All seven hourly layers for an export: cached hours at once, the rest from a worker. Without
 * Worker support (tests), missing hours come back empty rather than blocking the page.
 */
export function sunStudyLayersFor(model: CityModel, date: SunStudyDate): Promise<SunStudyLayer[]> {
  const modelKey = sunStudyModelKey(model);
  const collect = () =>
    SUN_STUDY_HOURS.map((hour) => ({ hour, rings: hourCache.get(sunStudyHourKey(modelKey, date, hour)) ?? [] }));
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
      remember(sunStudyHourKey(modelKey, date, message.hour), message.type === "hour" ? message.rings : []);
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
      model: { sideM: model.sideM, terrain: model.terrain, frameShape: model.frameShape, buildings: model.buildings },
      date: { lat: date.lat, lon: date.lon, year: date.year, month: date.month, day: date.day },
      hours: [...missing],
    };
    worker.postMessage(request);
  });
}

/**
 * Hourly plan shadows for the sun study, computed off the main thread. Layers appear as each hour
 * finishes; hours already in the cache show at once. Returns the layers ready so far and whether
 * any are still pending.
 */
export function useSunStudyShadows(
  model: CityModel,
  date: SunStudyDate | null,
): { layers: SunStudyLayer[]; pending: boolean } {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
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
      remember(sunStudyHourKey(modelKey, date, message.hour), message.type === "hour" ? message.rings : []);
      setRevision((value) => value + 1);
    };
    worker.onerror = (event) => {
      event.preventDefault();
    };
    const request: SunStudyWorkerRequest = {
      id,
      model: { sideM: model.sideM, terrain: model.terrain, frameShape: model.frameShape, buildings: model.buildings },
      date: { lat: date.lat, lon: date.lon, year: date.year, month: date.month, day: date.day },
      hours: [...missing],
    };
    worker.postMessage(request);
    return () => worker.terminate();
    // dateKey covers date's fields; model is covered by modelKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, dateKey]);

  return useMemo(() => {
    if (!date) return { layers: [], pending: false };
    const layers: SunStudyLayer[] = [];
    let pending = false;
    for (const hour of SUN_STUDY_HOURS) {
      const rings = hourCache.get(sunStudyHourKey(modelKey, date, hour));
      if (rings) layers.push({ hour, rings });
      else pending = true;
    }
    return { layers, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey, dateKey, revision]);
}
