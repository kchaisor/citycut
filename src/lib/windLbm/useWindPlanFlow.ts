import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildingFeat } from "../../types";
import type { WindPeriodStats } from "../windRose";
import { pickWindGridLongSide } from "./lbmConstants";
import {
  createLbmState,
  inflowFromDirectionDeg,
  inflowFromSector,
  lbmWarmUpSettle,
  resetLbmInflow,
  speedLuFromKmh,
} from "./lbmCpu";
import { cutFluidSpeedStats, flowVisualNormSpeed } from "./flowVisualNorm";
import { LbmGpuSurface } from "./lbmGpu";
import { obstacleMaskFingerprint, rasterizeBuildingObstacles, windLbmGridSpec } from "./obstacleRaster";
import type { WindLbmBackend, WindLbmFlowSettings, WindLbmSolverState } from "./types";
import { flowAlignmentScore, lbmGridFlowStats, meanFlowVector, particlesInsideCutRatio } from "./windFlowQa";
import { runWindLbmCpuSteps } from "./windLbmWorkerClient";
import {
  WIND_PARTICLE_COUNT,
  advectWindParticles,
  maxParticleTrailSegmentM,
  particleBinOccupancyFraction,
  particleFingerprint,
  spawnWindParticles,
  type WindFlowParticle,
} from "./windParticles";

export type WindPlanFlowSnapshot = {
  backend: WindLbmBackend;
  solver: WindLbmSolverState | null;
  particles: WindFlowParticle[];
  frame: number;
  particleHash: string;
  directionDeg: number;
  meanUx: number;
  meanUy: number;
  inCutRatio: number;
  gpuSteps: number;
  gpuHasStepped: boolean;
  gridStats: ReturnType<typeof lbmGridFlowStats> | null;
  cutStats: ReturnType<typeof cutFluidSpeedStats> | null;
  maxTrailSegM: number;
  binOccupancy: number;
  warmUpSteps: number;
  flowReveal: number;
  lastFrameMs: number;
  normSpeed: number;
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

function settleSolver(state: WindLbmSolverState, scratch: Float32Array | null): number {
  const result = lbmWarmUpSettle(state, {
    maxBundles: 28,
    bundleSteps: 100,
    relTol: 0.01,
    scratch: scratch ?? undefined,
  });
  return result.totalSteps;
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
}): WindPlanFlowSnapshot & { flowReveal: number; normSpeed: number } {
  const [frame, setFrame] = useState(0);
  const [particles, setParticles] = useState<WindFlowParticle[]>(() => spawnWindParticles(WIND_PARTICLE_COUNT, sideM));
  const [backend, setBackend] = useState<WindLbmBackend>("cpu");
  const [gpuSteps, setGpuSteps] = useState(0);
  const [gpuHasStepped, setGpuHasStepped] = useState(false);
  const [flowReveal, setFlowReveal] = useState(1);
  const [warmUpSteps, setWarmUpSteps] = useState(0);
  const [lastFrameMs, setLastFrameMs] = useState(0);
  const solverRef = useRef<WindLbmSolverState | null>(null);
  const scratchRef = useRef<Float32Array | null>(null);
  const gpuRef = useRef<LbmGpuSurface | null>(null);
  const obstacleKeyRef = useRef("");
  const inflowKeyRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const particlesRef = useRef(particles);
  const cpuOnlyFramesRef = useRef(0);
  const gpuHasSteppedRef = useRef(false);
  const flowRevealRef = useRef(1);

  const gridLong = useMemo(() => pickWindGridLongSide(sideM), [sideM]);
  const spec = useMemo(() => windLbmGridSpec(sideM, gridLong), [sideM, gridLong]);
  const obstacleKey = useMemo(() => obstacleMaskFingerprint(buildings, spec), [buildings, spec]);

  const directionDeg = effectiveDirectionDeg(settings, stats);
  const speedKmh = (stats?.prevailingMedianKmh ?? 18) * settings.speedScale;
  const speedLu = speedLuFromKmh(speedKmh);
  const inflowKey = `${directionDeg.toFixed(1)}:${speedLu.toFixed(4)}`;

  useEffect(() => {
    particlesRef.current = spawnWindParticles(WIND_PARTICLE_COUNT, sideM, directionDeg);
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
    setGpuSteps(0);
    setGpuHasStepped(false);
    gpuHasSteppedRef.current = false;
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
    const fresh = !state || obstacleKeyRef.current !== obstacleKey;
  const scratch = scratchRef.current;
    let warmed = 0;
    if (fresh) {
      const obstacle = rasterizeBuildingObstacles(buildings, spec);
      state = createLbmState(spec, obstacle, inflow);
      obstacleKeyRef.current = obstacleKey;
      inflowKeyRef.current = inflowKey;
      warmed = settleSolver(state, scratch);
      cpuOnlyFramesRef.current = 6;
      flowRevealRef.current = 0;
      setFlowReveal(0);
      gpuRef.current?.uploadState(state);
    } else if (state && inflowKeyRef.current !== inflowKey) {
      state = resetLbmInflow(state, inflow);
      inflowKeyRef.current = inflowKey;
      warmed = settleSolver(state, scratch);
      cpuOnlyFramesRef.current = 6;
      flowRevealRef.current = 0;
      setFlowReveal(0);
      gpuRef.current?.uploadState(state);
    }
    if (!state) return;
    solverRef.current = state;
    setWarmUpSteps(warmed);
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
      setLastFrameMs(dt * 1000);
      if (flowRevealRef.current < 1) {
        flowRevealRef.current = Math.min(1, flowRevealRef.current + dt * 2.4);
        setFlowReveal(flowRevealRef.current);
      }
      const state = solverRef.current;
      if (state) {
        const scratch = scratchRef.current;
        const gpu = gpuRef.current;
        const steps = gpu?.backend === "gpu" ? 1 : 2;
        if (cpuOnlyFramesRef.current > 0) {
          if (scratch) runWindLbmCpuSteps(state, steps + 1, scratch);
          cpuOnlyFramesRef.current -= 1;
          if (cpuOnlyFramesRef.current === 0 && gpu?.backend === "gpu") {
            gpu.uploadState(state);
          }
        } else if (gpu?.backend === "gpu") {
          gpu.step(state, steps);
          gpuHasSteppedRef.current = true;
          setGpuHasStepped(true);
          setGpuSteps(gpu.gpuStepCount());
        } else if (scratch) {
          runWindLbmCpuSteps(state, steps, scratch);
        }
        if (flowRevealRef.current > 0.15) {
          advectWindParticles(particlesRef.current, state, dt, sideM);
          setParticles([...particlesRef.current]);
        }
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

  const half = sideM / 2;
  const mean = meanFlowVector(solverRef.current);
  const inCutRatio = particlesInsideCutRatio(particles, half);
  const particleHash = useMemo(() => particleFingerprint(particles), [particles, frame]);
  const gridStats = solverRef.current ? lbmGridFlowStats(solverRef.current) : null;
  const cutStats = solverRef.current ? cutFluidSpeedStats(solverRef.current) : null;
  const liveNorm = solverRef.current ? flowVisualNormSpeed(solverRef.current) : speedLu;

  useEffect(() => {
    if (!qaExpose) return;
    window.__citycutQaWindFlow = {
      getSnapshot: () => ({
        backend,
        solver: solverRef.current,
        particles: particlesRef.current,
        frame,
        particleHash: particleFingerprint(particlesRef.current),
        directionDeg,
        meanUx: meanFlowVector(solverRef.current).ux,
        meanUy: meanFlowVector(solverRef.current).uy,
        inCutRatio: particlesInsideCutRatio(particlesRef.current, half),
        gpuSteps: gpuRef.current?.gpuStepCount() ?? 0,
        gpuHasStepped: gpuHasSteppedRef.current || (gpuRef.current?.gpuStepCount() ?? 0) > 0,
        gridStats: solverRef.current ? lbmGridFlowStats(solverRef.current) : null,
        cutStats: solverRef.current ? cutFluidSpeedStats(solverRef.current) : null,
        maxTrailSegM: maxParticleTrailSegmentM(particlesRef.current, half),
        binOccupancy: particleBinOccupancyFraction(particlesRef.current, sideM, 10),
        warmUpSteps,
        flowReveal: flowRevealRef.current,
        lastFrameMs,
        normSpeed: solverRef.current ? flowVisualNormSpeed(solverRef.current) : speedLu,
      }),
    };
    return () => {
      delete window.__citycutQaWindFlow;
    };
  }, [qaExpose, backend, frame, particleHash, directionDeg, half, gpuHasStepped, sideM, warmUpSteps, lastFrameMs, speedLu]);

  return {
    backend,
    solver: active ? solverRef.current : null,
    particles,
    frame,
    particleHash,
    directionDeg,
    meanUx: mean.ux,
    meanUy: mean.uy,
    inCutRatio,
    gpuSteps,
    gpuHasStepped,
    gridStats,
    cutStats,
    maxTrailSegM: maxParticleTrailSegmentM(particles, half),
    binOccupancy: particleBinOccupancyFraction(particles, sideM, 10),
    warmUpSteps,
    flowReveal,
    lastFrameMs,
    normSpeed: liveNorm,
  };
}

export { flowAlignmentScore };
