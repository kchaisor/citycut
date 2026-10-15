import { useEffect, useMemo, useState } from "react";
import { squareBBox } from "./geo";
import { modelHasClippedWaterInFrame, type AxoLayerId, type ExplodedAxoOverlayBundle } from "./explodedAxo";
import {
  fetchHydroOverlays,
  fetchPlanningOverlays,
  fetchTopographyContours,
  fetchTransportRail,
} from "./explodedAxoOverlayFetch";
import { fetchPublicTransportOverlays } from "./explodedAxoPt";
import { fetchOvertureBaseForCut } from "./overtureBase";
import { fetchTerrainForCut } from "./fetchTerrain";
import type { CityModel } from "../types";

async function publicTransportOverlaysSafe(
  model: CityModel,
  bounds: ReturnType<typeof squareBBox>,
  signal?: AbortSignal,
) {
  try {
    return await fetchPublicTransportOverlays(model, bounds, signal);
  } catch {
    return null;
  }
}

export type OverlayLoadState = ExplodedAxoOverlayBundle;

const OVERLAY_LAYER_IDS: AxoLayerId[] = ["planning", "hydro", "transport", "topography", "terrain"];

/** Mapterhorn field for the terrain plate; reuses the model field when Terrain was built. */
function terrainTask(model: CityModel, next: ExplodedAxoOverlayBundle, signal?: AbortSignal): Promise<void> {
  if (model.terrain) return Promise.resolve();
  return fetchTerrainForCut(model.center, model.sideM, signal).then(
    (field) => {
      next.terrain = field;
    },
    (err) => {
      if (signal?.aborted) throw err;
      next.terrain = "unavailable";
    },
  );
}

export function overlaysNeeded(layerVisible: Record<AxoLayerId, boolean>): boolean {
  return OVERLAY_LAYER_IDS.some((id) => layerVisible[id]) || layerVisible.water;
}

export function useExplodedAxoOverlays(model: CityModel, layerVisible: Record<AxoLayerId, boolean>): OverlayLoadState {
  const need = useMemo(() => overlaysNeeded(layerVisible), [layerVisible]);
  const [state, setState] = useState<OverlayLoadState>({});

  useEffect(() => {
    if (!need) {
      setState({});
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const bounds = squareBBox(model.center, model.sideM);
      const next: OverlayLoadState = {};

      const tasks: Promise<void>[] = [];

      if (layerVisible.planning) {
        tasks.push(
          fetchPlanningOverlays(model, controller.signal).then((result) => {
            next.planning = result.ok ? result.data : "unavailable";
          }),
        );
      }

      if (layerVisible.hydro || layerVisible.water) {
        tasks.push(
          fetchHydroOverlays(model, controller.signal).then((result) => {
            next.hydro = result.ok ? result.data : "unavailable";
          }),
        );
        if (!modelHasClippedWaterInFrame(model)) {
          tasks.push(
            fetchOvertureBaseForCut(bounds, model.center, model.sideM, {
              waterGreen: true,
              trees: false,
              frameShape: model.frameShape,
            }, controller.signal).then((base) => {
              next.overtureWater = base.areas.filter((area) => area.kind === "water");
            }),
          );
        }
      }

      if (layerVisible.transport) {
        tasks.push(
          (async () => {
            const rail = await fetchTransportRail(model, controller.signal);
            const pt = await publicTransportOverlaysSafe(model, bounds, controller.signal);
            if (!rail.ok && !pt) {
              next.transport = "unavailable";
            } else {
              next.transport = {
                rail: rail.ok ? rail.data : { lines: [], stations: [] },
                pt,
              };
            }
          })(),
        );
      }

      if (layerVisible.topography) {
        tasks.push(
          fetchTopographyContours(model, controller.signal).then((result) => {
            next.topography = result.ok ? result.data : "unavailable";
          }),
        );
      }
      if (layerVisible.terrain) tasks.push(terrainTask(model, next, controller.signal));

      try {
        await Promise.all(tasks);
      } catch {
        return;
      }
      if (!cancelled) setState(next);
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [model, need, layerVisible.planning, layerVisible.hydro, layerVisible.water, layerVisible.transport, layerVisible.topography, layerVisible.terrain]);

  return need ? state : {};
}

export async function loadExplodedAxoOverlayBundle(
  model: CityModel,
  layerVisible: Record<AxoLayerId, boolean>,
  signal?: AbortSignal,
): Promise<ExplodedAxoOverlayBundle> {
  if (!overlaysNeeded(layerVisible)) return {};
  const bounds = squareBBox(model.center, model.sideM);
  const next: ExplodedAxoOverlayBundle = {};
  const tasks: Promise<void>[] = [];

  if (layerVisible.planning) {
    tasks.push(
      fetchPlanningOverlays(model, signal).then((result) => {
        next.planning = result.ok ? result.data : "unavailable";
      }),
    );
  }
  if (layerVisible.hydro || layerVisible.water) {
    tasks.push(
      fetchHydroOverlays(model, signal).then((result) => {
        next.hydro = result.ok ? result.data : "unavailable";
      }),
    );
    if (!modelHasClippedWaterInFrame(model)) {
      tasks.push(
        fetchOvertureBaseForCut(bounds, model.center, model.sideM, {
          waterGreen: true,
          trees: false,
          frameShape: model.frameShape,
        }, signal).then((base) => {
          next.overtureWater = base.areas.filter((area) => area.kind === "water");
        }),
      );
    }
  }
  if (layerVisible.transport) {
    tasks.push(
      (async () => {
        const rail = await fetchTransportRail(model, signal);
        const pt = await publicTransportOverlaysSafe(model, bounds, signal);
        if (!rail.ok && !pt) next.transport = "unavailable";
        else {
          next.transport = {
            rail: rail.ok ? rail.data : { lines: [], stations: [] },
            pt,
          };
        }
      })(),
    );
  }
  if (layerVisible.topography) {
    tasks.push(
      fetchTopographyContours(model, signal).then((result) => {
        next.topography = result.ok ? result.data : "unavailable";
      }),
    );
  }
  if (layerVisible.terrain) tasks.push(terrainTask(model, next, signal));
  await Promise.all(tasks);
  return next;
}
