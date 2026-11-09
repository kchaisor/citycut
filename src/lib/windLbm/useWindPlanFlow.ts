import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildingFeat } from "../../types";
import type { WindPeriodStats } from "../windRose";
import { pickWindGridLongSide } from "./lbmConstants";
import {
  createLbmState,
  inflowFromDirectionDeg,
  inflowFromSector,
  lbmCpuStep,
  resetLbmInflow,
  speedLuFromKmh,
} from "./lbmCpu";
import { LbmGpuSurface } from "./lbmGpu";
import { obstacleMaskFingerprint, rasterizeBuildingObstacles, windLbmGridSpec } from "./obstacleRaster";
import type { WindLbmBackend, WindLbmFlowSettings, WindLbmSolverState } from "./types";
import { advectWindParticles, particleFingerprint, spawnWindParticles, type WindFlowParticle } from "./windParticles";

export type WindPlanFlowSnapshot = {
  backend: WindLbmBackend;
  solver: WindLbmSolverState | null;
  particles: WindFlowParticle[];
  frame: number;
  particleHash: string;
};

declare global {
  interface Window {
    __citycutQaWindFlow?: {
      getSnapshot: () => WindPlanFlowSnapshot;
    };
  }
}

function effectiveDirectionDeg(settings: WindLbmFlowSettings, stats: WindPeriodStats | null): number {
  if (settings.directionDeg != null) return settings.directionDeg;
  if (stats) return stats.prevailingSector * 22.5;
  return 270;
}

export function useWindPlanFlow({
  active,
  sideM,
  buildings,
  stats,
  settings,
  qaExpose = false,
}: {
  active: boolean;
  sideM: number;
  buildings: readonly BuildingFeat[];
  stats: WindPeriodStats | null;
  settings: WindLbmFlowSettings;
  qaExpose?: boolean;
}): WindPlanFlowSnapshot {
  const [frame, setFrame] = useState(0);
  const [particles, setParticles] = useState<WindFlowParticle[]>(() => spawnWindParticles(220, sideM));
  const [backend, setBackend] = useState<WindLbmBackend>("cpu");
  const solverRef = useRef<WindLbmSolverState | null>(null);
  const scratchRef = useRef<Float32Array | null>(null);
  const gpuRef = useRef<LbmGpuSurface | null>(null);
  const obstacleKeyRef = useRef("");
  const inflowKeyRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(particles);

  const gridLong = useMemo(() => pickWindGridLongSide(sideM), [sideM]);
  const spec = useMemo(() => windLbmGridSpec(sideM, gridLong), [sideM, gridLong]);
  const obstacleKey = useMemo(() => obstacleMaskFingerprint(buildings, spec), [buildings, spec]);

  const directionDeg = effectiveDirectionDeg(settings, stats);
  const speedKmh = (stats?.prevailingMedianKmh ?? 18) * settings.speedScale;
  const speedLu = speedLuFromKmh(speedKmh);
  const inflowKey = `${directionDeg.toFixed(1)}:${speedLu.toFixed(4)}`;

  useEffect(() => {
    particlesRef.current = spawnWindParticles(220, sideM, directionDeg);
    setParticles(particlesRef.current);
  }, [sideM]);

  useEffect(() => {
    if (!active) {
      gpuRef.current?.dispose();
      gpuRef.current = null;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = spec.nx;
    canvas.height = spec.ny;
    const gpu = new LbmGpuSurface(canvas);
    gpuRef.current = gpu;
    setBackend(gpu.backend);
    return () => {
      gpu.dispose();
      gpuRef.current = null;
    };
  }, [active, spec.nx, spec.ny]);

  useEffect(() => {
    if (!active) {
      solverRef.current = null;
      return;
    }
    const inflow =
      stats != null && settings.directionDeg == null
        ? inflowFromSector(stats.prevailingSector, speedLu)
        : inflowFromDirectionDeg(directionDeg, speedLu);
    let state = solverRef.current;
    if (!state || obstacleKeyRef.current !== obstacleKey) {
      const obstacle = rasterizeBuildingObstacles(buildings, spec);
      state = createLbmState(spec, obstacle, inflow);
      obstacleKeyRef.current = obstacleKey;
      inflowKeyRef.current = inflowKey;
    } else if (inflowKeyRef.current !== inflowKey) {
      state = resetLbmInflow(state, inflow);
      inflowKeyRef.current = inflowKey;
      particlesRef.current = spawnWindParticles(220, sideM, directionDeg);
      setParticles(particlesRef.current);
    }
    solverRef.current = state;
    const n = state.f.length;
    if (!scratchRef.current || scratchRef.current.length !== n) scratchRef.current = new Float32Array(n);
  }, [active, obstacleKey, inflowKey, buildings, spec, stats, settings.directionDeg, directionDeg, speedLu, sideM]);

  useEffect(() => {
    if (!active || !settings.playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      const state = solverRef.current;
      if (state) {
        const steps = backend === "gpu" ? 3 : 2;
        const scratch = scratchRef.current;
        const gpu = gpuRef.current;
        if (gpu) {
          gpu.step(state, steps);
        } else {
          for (let s = 0; s < steps; s++) lbmCpuStep(state, scratch ?? undefined);
        }
        advectWindParticles(particlesRef.current, state, dt, sideM);
        setParticles([...particlesRef.current]);
        setFrame((f) => f + 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, settings.playing, sideM, backend]);

  const particleHash = useMemo(() => particleFingerprint(particles), [particles, frame]);

  useEffect(() => {
    if (!qaExpose) return;
    window.__citycutQaWindFlow = {
      getSnapshot: () => ({
        backend,
        solver: solverRef.current,
        particles: particlesRef.current,
        frame,
        particleHash: particleFingerprint(particlesRef.current),
      }),
    };
    return () => {
      delete window.__citycutQaWindFlow;
    };
  }, [qaExpose, backend, frame, particleHash]);

  return {
    backend,
    solver: active ? solverRef.current : null,
    particles,
    frame,
    particleHash,
  };
}
