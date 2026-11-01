import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignalTraceBuildingLook } from "../lib/signalTraceBuildingLook";
import { SignalTraceLayer } from "../lib/signalTraceLayer";
import { WALK_RIPPLE_TIMELINE_MAX_MIN } from "../lib/walkRippleNetwork";
import type { CityModel } from "../types";

export type SignalTraceTimeSpeed = 1 | 10 | 60;

export type SignalTraceState = {
  layer: SignalTraceLayer;
  buildingLook: SignalTraceBuildingLook;
  sourceBuildingId: number | null;
  timeSpeed: SignalTraceTimeSpeed;
  setTimeSpeed: (speed: SignalTraceTimeSpeed) => void;
  pickSourceBuilding: (buildingId: number) => void;
  clearSource: () => void;
  advanceFrame: (deltaSec: number) => void;
};

function buildingCentroid(model: CityModel, buildingId: number): [number, number] | null {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building || building.ring.length < 3) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of building.ring) {
    sx += x;
    sy += y;
  }
  const n = building.ring.length;
  return [sx / n, sy / n];
}

export function useSignalTrace(model: CityModel, active: boolean): SignalTraceState {
  const layer = useMemo(() => new SignalTraceLayer(model), [model]);
  const buildingLook = useMemo(() => new SignalTraceBuildingLook(), []);
  const [sourceBuildingId, setSourceBuildingId] = useState<number | null>(null);
  const [timeSpeed, setTimeSpeedState] = useState<SignalTraceTimeSpeed>(1);
  const signalTimeRef = useRef(0);
  const frameUpdateMsRef = useRef(0);
  const rippleMinutesRef = useRef(0);

  useEffect(() => () => layer.dispose(), [layer]);

  useEffect(() => {
    setSourceBuildingId(null);
    setTimeSpeedState(1);
    signalTimeRef.current = 0;
    rippleMinutesRef.current = 0;
    layer.clearSource();
    buildingLook.detach();
  }, [model, layer, buildingLook]);

  useEffect(() => {
    if (!active) {
      buildingLook.detach();
      layer.clearSource();
      setSourceBuildingId(null);
    }
  }, [active, buildingLook, layer]);

  const setTimeSpeed = useCallback((speed: SignalTraceTimeSpeed) => {
    setTimeSpeedState(speed);
  }, []);

  const pickSourceBuilding = useCallback(
    (buildingId: number) => {
      setSourceBuildingId(buildingId);
      const centroid = buildingCentroid(model, buildingId);
      if (centroid) {
        layer.setSourceOrigin(centroid[0], centroid[1]);
        rippleMinutesRef.current = 0;
      }
    },
    [layer, model],
  );

  const clearSource = useCallback(() => {
    setSourceBuildingId(null);
    layer.clearSource();
    rippleMinutesRef.current = 0;
  }, [layer]);

  const advanceFrame = useCallback(
    (deltaSec: number) => {
      const t0 = performance.now();
      const speed = timeSpeed;
      signalTimeRef.current += deltaSec * speed;
      layer.uniforms.uSignalTime.value = signalTimeRef.current;
      if (layer.uniforms.uRippleTime.value >= 0) {
        rippleMinutesRef.current += (deltaSec * speed * WALK_RIPPLE_TIMELINE_MAX_MIN) / 20;
        if (rippleMinutesRef.current > WALK_RIPPLE_TIMELINE_MAX_MIN) {
          rippleMinutesRef.current = 0;
        }
        layer.setRippleMinutes(rippleMinutesRef.current);
      }
      frameUpdateMsRef.current = performance.now() - t0;
      if (typeof window !== "undefined") {
        window.__signalTraceFrameUpdateMs = frameUpdateMsRef.current;
      }
    },
    [layer, timeSpeed],
  );

  return {
    layer,
    buildingLook,
    sourceBuildingId,
    timeSpeed,
    setTimeSpeed,
    pickSourceBuilding,
    clearSource,
    advanceFrame,
  };
}

declare global {
  interface Window {
    __signalTraceFrameUpdateMs?: number;
  }
}
