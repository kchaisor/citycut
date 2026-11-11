import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalkRippleBuildingTint } from "../lib/walkRippleBuildingTint";
import { WalkRippleLayer, walkRippleModeLabel } from "../lib/walkRippleLayer";
import {
  assignBuildingArrivals,
  buildWalkNetwork,
  computeRippleTimes,
  WALK_RIPPLE_TIMELINE_MAX_MIN,
  type RippleTimes,
} from "../lib/walkRippleNetwork";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import type { CityModel } from "../types";

export type WalkRippleStatus = "idle" | "placing" | "ready" | "animating";

const ANIM_REAL_MS = 5200;

export type WalkRipple = {
  layer: WalkRippleLayer;
  tint: WalkRippleBuildingTint;
  placing: boolean;
  setPlacing: (on: boolean) => void;
  placePoint: (east: number, north: number) => void;
  clear: () => void;
  status: WalkRippleStatus;
  modeLabel: string | null;
  times: RippleTimes | null;
  arrivalCount: number;
  buildingArrivals: Map<number, number> | null;
  rippleMinutes: number;
  setRippleMinutes: (minutes: number) => void;
  ripplePlaying: boolean;
  toggleRipplePlay: () => void;
};

export function useWalkRipple(model: CityModel, analysisModel: Pick<CityModel, "buildings" | "roads" | "terrain" | "sideM">): WalkRipple {
  const layer = useMemo(() => new WalkRippleLayer(model), [model]);
  const tint = useMemo(() => new WalkRippleBuildingTint(), []);
  useEffect(() => () => layer.dispose(), [layer]);

  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState<WalkRippleStatus>("idle");
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [times, setTimes] = useState<RippleTimes | null>(null);
  const [arrivalCount, setArrivalCount] = useState(0);
  const [buildingArrivals, setBuildingArrivals] = useState<Map<number, number> | null>(null);
  const [rippleMinutes, setRippleMinutesState] = useState(0);
  const [ripplePlaying, setRipplePlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const networkRef = useRef(buildWalkNetwork(model.roads));
  const buildingArrivalsRef = useRef<Map<number, number> | null>(null);

  useEffect(() => {
    buildingArrivalsRef.current = buildingArrivals;
  }, [buildingArrivals]);

  useEffect(() => {
    networkRef.current = buildWalkNetwork(model.roads);
    setPlacing(false);
    setStatus("idle");
    setModeLabel(null);
    setTimes(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
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
      if (times) {
        setStatus(clamped >= WALK_RIPPLE_TIMELINE_MAX_MIN - 0.01 ? "ready" : "animating");
      }
      if (!opts?.keepPlaying) stopAnim();
    },
    [layer, stopAnim, times, tint],
  );

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
    };
    return () => {
      delete window.__citycutWalkRippleQa;
    };
  }, [applyRippleMinutes, layer, rippleMinutes]);

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
  }, [layer, stopAnim, tint]);

  const toggleRipplePlay = useCallback(() => {
    if (!times) return;
    if (ripplePlaying) {
      stopAnim();
      return;
    }
    startAnim();
  }, [ripplePlaying, startAnim, stopAnim, times]);

  const runAnalysis = useCallback(
    (east: number, north: number) => {
      stopAnim();
      const computed = computeRippleTimes(analysisModel, east, north);
      const network = computed.mode === "network" ? buildWalkNetwork(analysisModel.roads) : null;
      const arrivals = assignBuildingArrivals(analysisModel, computed);
      layer.applyResult(computed, network);
      setTimes(computed);
      setModeLabel(walkRippleModeLabel(computed));
      setArrivalCount(arrivals.size);
      setBuildingArrivals(new Map(arrivals));
      setPlacing(false);
      setStatus("animating");
      return { computed, arrivals };
    },
    [analysisModel, layer, stopAnim],
  );

  const placePoint = useCallback(
    (east: number, north: number) => {
      runAnalysis(east, north);
      startAnim();
    },
    [runAnalysis, startAnim],
  );

  const clear = useCallback(() => {
    stopAnim();
    layer.clear();
    tint.detach();
    setTimes(null);
    setModeLabel(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
    setRippleMinutesState(0);
    setStatus("idle");
    setPlacing(false);
  }, [layer, stopAnim, tint]);

  return {
    layer,
    tint,
    placing,
    setPlacing: (on: boolean) => {
      setPlacing(on);
      setStatus(on ? "placing" : status === "placing" ? "idle" : status);
    },
    placePoint,
    clear,
    status,
    modeLabel,
    times,
    arrivalCount,
    buildingArrivals,
    rippleMinutes,
    setRippleMinutes: (minutes: number) => applyRippleMinutes(minutes),
    ripplePlaying,
    toggleRipplePlay,
  };
}
