import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalkRippleBuildingTint } from "../lib/walkRippleBuildingTint";
import { WalkRippleLayer, walkRippleModeLabel } from "../lib/walkRippleLayer";
import {
  buildWalkNetwork,
  WALK_RIPPLE_TIMELINE_MAX_MIN,
  type RippleTimes,
} from "../lib/walkRippleNetwork";
import {
  computeOriginSharesAtMinute,
  formatOriginSharePercents,
  WALK_RIPPLE_MAX_ORIGINS,
  type OriginShare,
} from "../lib/walkRippleMultiSource";
import { runWalkRippleInWorker } from "../lib/walkRippleWorkerClient";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import type { CityModel } from "../types";

export type WalkRippleStatus = "idle" | "placing" | "ready" | "animating" | "computing";

const ANIM_REAL_MS = 5200;
const DRAG_RECOMPUTE_MS = 140;

export type WalkRipple = {
  layer: WalkRippleLayer;
  tint: WalkRippleBuildingTint;
  placing: boolean;
  setPlacing: (on: boolean) => void;
  placePoint: (east: number, north: number) => void;
  addOrigin: (east: number, north: number) => void;
  removeOrigin: (index: number) => void;
  moveOrigin: (index: number, east: number, north: number) => void;
  clear: () => void;
  status: WalkRippleStatus;
  modeLabel: string | null;
  times: RippleTimes | null;
  originPoints: Array<[number, number]>;
  arrivalCount: number;
  buildingArrivals: Map<number, number> | null;
  buildingOriginById: Map<number, number> | null;
  originShares: OriginShare[];
  originShareLabels: string[];
  workerMs: number | null;
  rippleMinutes: number;
  setRippleMinutes: (minutes: number) => void;
  ripplePlaying: boolean;
  toggleRipplePlay: () => void;
  canAddOrigin: boolean;
};

export function useWalkRipple(model: CityModel, analysisModel: Pick<CityModel, "buildings" | "roads" | "terrain" | "sideM">): WalkRipple {
  const layer = useMemo(() => new WalkRippleLayer(model), [model]);
  const tint = useMemo(() => new WalkRippleBuildingTint(), []);
  useEffect(() => () => layer.dispose(), [layer]);

  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState<WalkRippleStatus>("idle");
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [times, setTimes] = useState<RippleTimes | null>(null);
  const [originPoints, setOriginPoints] = useState<Array<[number, number]>>([]);
  const [arrivalCount, setArrivalCount] = useState(0);
  const [buildingArrivals, setBuildingArrivals] = useState<Map<number, number> | null>(null);
  const [buildingOriginById, setBuildingOriginById] = useState<Map<number, number> | null>(null);
  const [originShares, setOriginShares] = useState<OriginShare[]>([]);
  const [originShareLabels, setOriginShareLabels] = useState<string[]>([]);
  const [workerMs, setWorkerMs] = useState<number | null>(null);
  const [rippleMinutes, setRippleMinutesState] = useState(0);
  const [ripplePlaying, setRipplePlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const networkRef = useRef(buildWalkNetwork(model.roads));
  const buildingArrivalsRef = useRef<Map<number, number> | null>(null);
  const computeAbortRef = useRef<AbortController | null>(null);
  const dragTimerRef = useRef<number | null>(null);
  const pendingOriginsRef = useRef<Array<[number, number]>>([]);
  const originPointsRef = useRef<Array<[number, number]>>([]);
  const rippleMinutesRef = useRef(0);

  useEffect(() => {
    buildingArrivalsRef.current = buildingArrivals;
  }, [buildingArrivals]);

  useEffect(() => {
    rippleMinutesRef.current = rippleMinutes;
  }, [rippleMinutes]);

  useEffect(() => {
    originPointsRef.current = originPoints;
  }, [originPoints]);

  const refreshShares = useCallback(
    (nextTimes: RippleTimes, arrivals: Map<number, number>, origins: Map<number, number>, minute: number) => {
      if (nextTimes.mode !== "network") {
        setOriginShares([]);
        setOriginShareLabels([]);
        return;
      }
      const network = buildWalkNetwork(analysisModel.roads);
      if (!network) return;
      const shares = computeOriginSharesAtMinute(
        network,
        nextTimes.nodeTimesMin,
        nextTimes.nodeOriginId,
        arrivals,
        origins,
        minute,
      );
      setOriginShares(shares.slice(0, nextTimes.origins.length));
      setOriginShareLabels(formatOriginSharePercents(shares.slice(0, nextTimes.origins.length)));
    },
    [analysisModel.roads],
  );

  useEffect(() => {
    networkRef.current = buildWalkNetwork(model.roads);
    computeAbortRef.current?.abort();
    setPlacing(false);
    setStatus("idle");
    setModeLabel(null);
    setTimes(null);
    setOriginPoints([]);
    setArrivalCount(0);
    setBuildingArrivals(null);
    setBuildingOriginById(null);
    setOriginShares([]);
    setOriginShareLabels([]);
    setWorkerMs(null);
    setRippleMinutesState(0);
    setRipplePlaying(false);
    layer.clear();
    tint.detach();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, [model, layer, tint]);

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setRipplePlaying(false);
  }, []);

  const applyRippleMinutes = useCallback(
    (minutes: number, opts?: { keepPlaying?: boolean }) => {
      const clamped = Math.max(0, Math.min(WALK_RIPPLE_TIMELINE_MAX_MIN, minutes));
      layer.setRippleTimeMinutes(clamped);
      tint.setRippleTimeMinutes(clamped);
      setRippleMinutesState(clamped);
      if (times && buildingArrivals && buildingOriginById) {
        refreshShares(times, buildingArrivals, buildingOriginById, clamped);
      }
      if (times) {
        setStatus(clamped >= WALK_RIPPLE_TIMELINE_MAX_MIN - 0.01 ? "ready" : "animating");
      }
      if (!opts?.keepPlaying) stopAnim();
    },
    [layer, stopAnim, times, tint, buildingArrivals, buildingOriginById, refreshShares],
  );

  const startAnim = useCallback(() => {
    stopAnim();
    setRipplePlaying(true);
    setStatus("animating");
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / ANIM_REAL_MS);
      const minutes = u * WALK_RIPPLE_TIMELINE_MAX_MIN;
      layer.setRippleTimeMinutes(minutes);
      tint.setRippleTimeMinutes(minutes);
      setRippleMinutesState(minutes);
      if (times && buildingArrivals && buildingOriginById) {
        refreshShares(times, buildingArrivals, buildingOriginById, minutes);
      }
      if (u < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setStatus("ready");
        setRipplePlaying(false);
        rafRef.current = null;
      }
    };
    layer.setRippleTimeMinutes(0);
    tint.setRippleTimeMinutes(0);
    setRippleMinutesState(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [layer, stopAnim, tint, times, buildingArrivals, buildingOriginById, refreshShares]);

  const toggleRipplePlay = useCallback(() => {
    if (!times) return;
    if (ripplePlaying) {
      stopAnim();
      return;
    }
    startAnim();
  }, [ripplePlaying, startAnim, stopAnim, times]);

  const applyComputeResult = useCallback(
    (
      computed: RippleTimes,
      arrivals: Map<number, number>,
      originByBuildingId: Map<number, number>,
      origins: Array<[number, number]>,
      ms: number,
      opts?: { animate?: boolean },
    ) => {
      const network = computed.mode === "network" ? buildWalkNetwork(analysisModel.roads) : null;
      layer.applyResult(computed, network);
      layer.setRivalMode(computed.mode === "network" ? computed.origins.length : 0);
      tint.refreshColours();
      setTimes(computed);
      setOriginPoints(origins);
      setModeLabel(walkRippleModeLabel(computed));
      setArrivalCount(arrivals.size);
      setBuildingArrivals(new Map(arrivals));
      setBuildingOriginById(new Map(originByBuildingId));
      setWorkerMs(ms);
      refreshShares(computed, arrivals, originByBuildingId, rippleMinutesRef.current);
      setPlacing(false);
      setStatus("animating");
      if (opts?.animate !== false) startAnim();
    },
    [analysisModel.roads, layer, refreshShares, startAnim, tint],
  );

  const runAnalysis = useCallback(
    (origins: Array<[number, number]>, opts?: { animate?: boolean }) => {
      if (origins.length === 0) return;
      stopAnim();
      computeAbortRef.current?.abort();
      const controller = new AbortController();
      computeAbortRef.current = controller;
      setStatus("computing");
      pendingOriginsRef.current = origins;
      runWalkRippleInWorker(analysisModel.roads, analysisModel.buildings, origins, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          applyComputeResult(result.times, result.arrivals, result.originByBuildingId, origins, result.ms, opts);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setStatus(originPoints.length > 0 ? "ready" : "idle");
        });
    },
    [analysisModel.buildings, analysisModel.roads, applyComputeResult, originPoints.length, stopAnim],
  );

  const placePoint = useCallback(
    (east: number, north: number) => {
      runAnalysis([[east, north]]);
    },
    [runAnalysis],
  );

  const addOrigin = useCallback(
    (east: number, north: number) => {
      const prev = originPointsRef.current;
      if (prev.length >= WALK_RIPPLE_MAX_ORIGINS) return;
      const next =
        prev.length === 0 ? [[east, north] as [number, number]] : [...prev, [east, north] as [number, number]];
      runAnalysis(next, { animate: prev.length === 0 });
    },
    [runAnalysis],
  );

  const removeOrigin = useCallback(
    (index: number) => {
      const next = originPoints.filter((_, i) => i !== index);
      if (next.length === 0) {
        stopAnim();
        layer.clear();
        tint.detach();
        setTimes(null);
        setOriginPoints([]);
        setModeLabel(null);
        setArrivalCount(0);
        setBuildingArrivals(null);
        setBuildingOriginById(null);
        setOriginShares([]);
        setOriginShareLabels([]);
        setWorkerMs(null);
        setRippleMinutesState(0);
        setStatus("idle");
        return;
      }
      runAnalysis(next, { animate: false });
      applyRippleMinutes(rippleMinutesRef.current);
    },
    [applyRippleMinutes, layer, originPoints, runAnalysis, stopAnim, tint],
  );

  const moveOrigin = useCallback(
    (index: number, east: number, north: number) => {
      const next = originPoints.map((pt, i) => (i === index ? ([east, north] as [number, number]) : pt));
      layer.updateOriginMarkerPosition(index, east, north);
      pendingOriginsRef.current = next;
      if (dragTimerRef.current !== null) window.clearTimeout(dragTimerRef.current);
      dragTimerRef.current = window.setTimeout(() => {
        dragTimerRef.current = null;
        runAnalysis(pendingOriginsRef.current, { animate: false });
        applyRippleMinutes(rippleMinutesRef.current);
      }, DRAG_RECOMPUTE_MS);
    },
    [applyRippleMinutes, layer, originPoints, runAnalysis],
  );

  const clear = useCallback(() => {
    stopAnim();
    computeAbortRef.current?.abort();
    if (dragTimerRef.current !== null) window.clearTimeout(dragTimerRef.current);
    layer.clear();
    tint.detach();
    setTimes(null);
    setOriginPoints([]);
    setModeLabel(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
    setBuildingOriginById(null);
    setOriginShares([]);
    setOriginShareLabels([]);
    setWorkerMs(null);
    setRippleMinutesState(0);
    setStatus("idle");
    setPlacing(false);
  }, [layer, stopAnim, tint]);

  const canAddOrigin = Boolean(times && originPoints.length > 0 && originPoints.length < WALK_RIPPLE_MAX_ORIGINS);

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    window.__citycutWalkRippleQa = {
      setMinutes: (minutes: number) => {
        applyRippleMinutes(minutes);
      },
      getMinutes: () => rippleMinutes,
      getUniformMinutes: () => layer.uniforms.uRippleTime.value,
      countReachedBuildings: (minuteCutoff: number) => {
        const map = buildingArrivalsRef.current;
        if (!map) return 0;
        let n = 0;
        for (const arrival of map.values()) {
          if (arrival <= minuteCutoff + 0.04) n += 1;
        }
        return n;
      },
      getWorkerMs: () => workerMs,
      getOriginCount: () => originPointsRef.current.length,
      addOriginAt: (east: number, north: number) => {
        addOrigin(east, north);
      },
    };
    return () => {
      delete window.__citycutWalkRippleQa;
    };
  }, [addOrigin, applyRippleMinutes, layer, rippleMinutes, workerMs]);

  return {
    layer,
    tint,
    placing,
    setPlacing: (on: boolean) => {
      setPlacing(on);
      setStatus(on ? "placing" : status === "placing" ? "idle" : status);
    },
    placePoint,
    addOrigin,
    removeOrigin,
    moveOrigin,
    clear,
    status,
    modeLabel,
    times,
    originPoints,
    arrivalCount,
    buildingArrivals,
    buildingOriginById,
    originShares,
    originShareLabels,
    workerMs,
    rippleMinutes,
    setRippleMinutes: (minutes: number) => applyRippleMinutes(minutes),
    ripplePlaying,
    toggleRipplePlay,
    canAddOrigin,
  };
}
