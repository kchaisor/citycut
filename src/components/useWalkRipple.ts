import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalkRippleBuildingTint } from "../lib/walkRippleBuildingTint";
import { WalkRippleLayer, walkRippleModeLabel, WALK_RIPPLE_MAX_MIN } from "../lib/walkRippleLayer";
import {
  assignBuildingArrivals,
  buildWalkNetwork,
  computeRippleTimes,
  type RippleTimes,
} from "../lib/walkRippleNetwork";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import type { CityModel } from "../types";

export type WalkRippleStatus = "idle" | "placing" | "ready" | "animating";

const ANIM_REAL_MS = 4200;

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
  const rafRef = useRef<number | null>(null);
  const networkRef = useRef(buildWalkNetwork(model.roads));

  useEffect(() => {
    networkRef.current = buildWalkNetwork(model.roads);
    setPlacing(false);
    setStatus("idle");
    setModeLabel(null);
    setTimes(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
    layer.clear();
    tint.detach();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, [model, layer, tint]);

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    window.__citycutWalkRippleQa = {
      setMinutes: (minutes: number) => {
        stopAnim();
        layer.setRippleTimeMinutes(minutes);
        tint.setRippleTimeMinutes(minutes);
        setStatus(minutes >= WALK_RIPPLE_MAX_MIN - 0.01 ? "ready" : "animating");
      },
    };
    return () => {
      delete window.__citycutWalkRippleQa;
    };
  }, [layer, stopAnim, tint]);

  const startAnim = useCallback(() => {
    stopAnim();
    setStatus("animating");
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / ANIM_REAL_MS);
      const minutes = u * (WALK_RIPPLE_MAX_MIN + 0.5);
      layer.setRippleTimeMinutes(minutes);
      tint.setRippleTimeMinutes(minutes);
      if (u < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setStatus("ready");
        rafRef.current = null;
      }
    };
    layer.setRippleTimeMinutes(0);
    tint.setRippleTimeMinutes(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [layer, stopAnim, tint]);

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
  };
}
