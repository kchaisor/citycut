import { useEffect, useMemo, useReducer, useRef } from "react";
import { REACH_MAX_TRAVEL_MIN } from "./constants";
import {
  classifyPtOnly,
  computeReachTimes,
  nearestCellIndex,
  reachAreaStats,
  reachMinuteSeries,
} from "./computeReach";
import { defaultOriginCell, loadReachDataset } from "./loadReachDataset";
import type { ReachDataset } from "./types";
import { initialReachExplorerState, reduceReachExplorer, type ReachExplorerAction } from "./reachState";
import type { ReachAreaStats, ReachCellTimes, ReachMinuteSeries } from "./types";

export type ReachExplorerModel = {
  status: "loading" | "ready" | "error";
  dataset: ReachDataset | null;
  error: string | null;
  state: ReturnType<typeof initialReachExplorerState>;
  dispatch: (action: ReachExplorerAction) => void;
  times: ReachCellTimes | null;
  ptOnly: boolean[];
  stats: ReachAreaStats | null;
  series: ReachMinuteSeries | null;
};

export function useReachExplorer(defaultLat: number, defaultLng: number): ReachExplorerModel {
  const [state, dispatch] = useReducer(reduceReachExplorer, undefined, initialReachExplorerState);
  const [status, setStatus] = useReducer(
    (_: "loading" | "ready" | "error", next: "loading" | "ready" | "error") => next,
    "loading",
  );
  const [dataset, setDataset] = useReducer((_: ReachDataset | null, next: ReachDataset | null) => next, null);
  const [error, setError] = useReducer((_: string | null, next: string | null) => next, null);
  const seeded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void loadReachDataset()
      .then((loaded) => {
        if (cancelled) return;
        setDataset(loaded);
        setStatus("ready");
        setError(null);
        if (!seeded.current) {
          seeded.current = true;
          const cell = defaultOriginCell(loaded, defaultLat, defaultLng);
          dispatch({ type: "set_origin", cellIndex: cell });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setDataset(null);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Reach data failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [defaultLat, defaultLng]);

  const times = useMemo(() => {
    if (!dataset || state.originCellIndex === null) return null;
    return computeReachTimes(dataset, state.originCellIndex, state.period, REACH_MAX_TRAVEL_MIN);
  }, [dataset, state.originCellIndex, state.period]);

  const ptOnly = useMemo(() => {
    if (!times) return [];
    return classifyPtOnly(times.walkMin, times.combinedMin, state.budgetMin);
  }, [times, state.budgetMin]);

  const stats = useMemo(() => {
    if (!dataset || !times) return null;
    return reachAreaStats(dataset, times, state.budgetMin);
  }, [dataset, times, state.budgetMin]);

  const series = useMemo(() => {
    if (!times) return null;
    return reachMinuteSeries(times, REACH_MAX_TRAVEL_MIN);
  }, [times]);

  useEffect(() => {
    if (typeof window === "undefined" || !dataset || state.originCellIndex === null || !times || !stats) return;
    window.__citycutReachQa = {
      budgetMin: state.budgetMin,
      period: state.period,
      originCellIndex: state.originCellIndex,
      walkKm2: stats.walkKm2,
      transitKm2: stats.transitKm2,
      pickCellAt: (lat: number, lng: number) => nearestCellIndex(dataset, lat, lng),
      setOriginCell: (cellIndex: number) => dispatch({ type: "set_origin", cellIndex }),
      setBudget: (budgetMin: number) => dispatch({ type: "set_budget", budgetMin }),
    };
    return () => {
      delete window.__citycutReachQa;
    };
  }, [dataset, state.budgetMin, state.originCellIndex, state.period, stats, times]);

  return {
    status,
    dataset,
    error,
    state,
    dispatch,
    times,
    ptOnly,
    stats,
    series,
  };
}

declare global {
  interface Window {
    __citycutReachQa?: {
      budgetMin: number;
      period: string;
      originCellIndex: number;
      walkKm2: number;
      transitKm2: number;
      pickCellAt: (lat: number, lng: number) => number;
      setOriginCell: (cellIndex: number) => void;
      setBudget: (budgetMin: number) => void;
    };
  }
}
