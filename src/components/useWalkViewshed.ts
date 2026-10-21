import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buildHeightGrid,
  groundHeightAt,
  spacedSplineSamples,
  viewshedFrame,
  walkGridBox,
  VIEWSHED_DEFAULT_EYE_M,
  VIEWSHED_DEFAULT_RADIUS_M,
  VIEWSHED_SAMPLE_SPACING_M,
  type HeightGrid,
} from "../lib/viewshed";
import type { ViewshedWorkerMessage, ViewshedWorkerRequest } from "../lib/viewshed.worker";
import { WalkViewshedLayer } from "../lib/walkViewshedLayer";
import { WalkPlayback, type WalkPlaybackSnapshot } from "../lib/walkPlayback";
import type { CityModel, Pt } from "../types";

/** Base walking pace for playback, metres per second. */
export const WALK_PACE_MPS = 1.4;
export const WALK_SPEEDS = [1, 4, 8] as const;
export type WalkSpeed = (typeof WALK_SPEEDS)[number];
export const WALK_EYE_MIN_M = 0.5;
export const WALK_EYE_MAX_M = 50;

export type WalkStatus = "empty" | "drawn" | "computing" | "ready";

export type WalkViewshed = {
  layer: WalkViewshedLayer;
  drawing: boolean;
  setDrawing: (on: boolean) => void;
  addPoint: (east: number, north: number) => void;
  clear: () => void;
  clickCount: number;
  sampleCount: number;
  lengthM: number;
  eyeM: number;
  setEyeM: (m: number) => void;
  radiusM: number;
  setRadiusM: (m: number) => void;
  status: WalkStatus;
  /** Results are from different settings than the current eye height or radius. */
  stale: boolean;
  progress: number;
  computeMs: number | null;
  compute: () => void;
  /** Viewpoint index, distance and readouts; read with useWalkPlayback (not part of page state). */
  playback: WalkPlayback;
  seek: (index: number) => void;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  speed: WalkSpeed;
  setSpeed: (speed: WalkSpeed) => void;
};

/** Playback readouts for the View panel. Only the subscriber re-renders as the walk moves. */
export function useWalkPlayback(walk: Pick<WalkViewshed, "playback">): WalkPlaybackSnapshot {
  return useSyncExternalStore(walk.playback.subscribe, walk.playback.getSnapshot, walk.playback.getSnapshot);
}

type Computed = { grid: HeightGrid; frames: (Uint8Array | null)[]; eyeM: number; radiusM: number };

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/viewshed.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * State for the View tab walk: the clicked path, its spline samples, the per-sample viewshed
 * frames (computed in a worker) and playback. Changing the model resets everything. Compute
 * reads buildings from `analysisModel` (edited heights, hidden buildings removed) at the time of compute.
 */
export function useWalkViewshed(model: CityModel, analysisModel: Pick<CityModel, "buildings" | "terrain" | "sideM"> = model): WalkViewshed {
  const layer = useMemo(() => new WalkViewshedLayer(model), [model]);
  useEffect(() => () => layer.dispose(), [layer]);
  const playback = useMemo(() => new WalkPlayback(layer), [layer]);

  const [points, setPoints] = useState<Pt[]>([]);
  const [drawing, setDrawingState] = useState(false);
  const [eyeM, setEyeMState] = useState(VIEWSHED_DEFAULT_EYE_M);
  const [radiusM, setRadiusM] = useState(VIEWSHED_DEFAULT_RADIUS_M);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [computeMs, setComputeMs] = useState<number | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeed] = useState<WalkSpeed>(4);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<number | null>(null);

  const spline = useMemo(() => spacedSplineSamples(points, VIEWSHED_SAMPLE_SPACING_M), [points]);
  const samples = spline.samples;

  const stopCompute = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setComputing(false);
  }, []);

  const resetResult = useCallback(() => {
    stopCompute();
    setComputed(null);
    setComputeMs(null);
    setProgress(0);
    setPlayingState(false);
    playback.load(null, [], 0);
    layer.setGrid(null);
  }, [layer, playback, stopCompute]);

  // New model: start over.
  useEffect(() => {
    setPoints([]);
    setDrawingState(false);
    resetResult();
  }, [model, resetResult]);
  useEffect(() => stopCompute, [stopCompute]);

  // Path display follows the clicks.
  useEffect(() => {
    const line = points.length >= 2 ? spacedSplineSamples(points, 1).samples : [];
    layer.setPath(points, line);
  }, [layer, points]);

  const addPoint = useCallback(
    (east: number, north: number) => {
      const half = model.sideM / 2;
      if (Math.abs(east) > half || Math.abs(north) > half) return;
      resetResult();
      setPoints((prev) => [...prev, [east, north]]);
    },
    [model.sideM, resetResult],
  );

  const clear = useCallback(() => {
    resetResult();
    setPoints([]);
    setDrawingState(true);
  }, [resetResult]);

  const setDrawing = useCallback(
    (on: boolean) => {
      setDrawingState(on);
      if (on) setPlayingState(false);
    },
    [],
  );

  const setEyeM = useCallback((m: number) => {
    if (!Number.isFinite(m)) return;
    setEyeMState(Math.min(WALK_EYE_MAX_M, Math.max(WALK_EYE_MIN_M, m)));
  }, []);

  const compute = useCallback(() => {
    if (samples.length < 2) return;
    resetResult();
    setDrawingState(false);
    const grid = buildHeightGrid(analysisModel, walkGridBox(samples, radiusM, model.sideM));
    const frames: (Uint8Array | null)[] = samples.map(() => null);
    const eyes = samples.map(([e, n]) => groundHeightAt(model, e, n) + eyeM);
    const result: Computed = { grid, frames, eyeM, radiusM };
    layer.setGrid(grid);
    playback.load(result, samples, spline.lengthM);
    setComputed(result);
    setComputing(true);
    const started = performance.now();
    let done = 0;
    const finish = () => {
      setComputing(false);
      setComputeMs(performance.now() - started);
      setPlayingState(true);
    };
    const accept = (i: number, frame: Uint8Array) => {
      frames[i] = frame;
      done++;
      // Progress in 5% steps: about 20 page renders per compute, not one per viewpoint.
      const pct = Math.floor((20 * done) / frames.length);
      if (pct !== Math.floor((20 * (done - 1)) / frames.length)) setProgress(pct / 20);
      playback.frameArrived(i);
    };
    const worker = startWorker();
    if (worker) {
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<ViewshedWorkerMessage>) => {
        const msg = event.data;
        if (msg.type === "frame") accept(msg.index, msg.frame);
        else {
          worker.terminate();
          workerRef.current = null;
          finish();
        }
      };
      const flat = new Float64Array(samples.length * 2);
      samples.forEach(([e, n], i) => {
        flat[2 * i] = e;
        flat[2 * i + 1] = n;
      });
      const request: ViewshedWorkerRequest = { grid, samples: flat, eyeZ: Float64Array.from(eyes), radius: radiusM };
      worker.postMessage(request);
      return;
    }
    // No worker (old browser or test): compute in small slices so the page stays responsive.
    let i = 0;
    const step = () => {
      const until = performance.now() + 12;
      while (i < samples.length && performance.now() < until) {
        const [e, n] = samples[i]!;
        accept(i, viewshedFrame(grid, e, n, eyes[i]!, radiusM));
        i++;
      }
      if (i < samples.length) timerRef.current = window.setTimeout(step, 0);
      else {
        timerRef.current = null;
        finish();
      }
    };
    timerRef.current = window.setTimeout(step, 0);
  }, [analysisModel, eyeM, layer, model, playback, radiusM, resetResult, samples, spline.lengthM]);

  // Playback runs outside React: rAF moves the walker every frame; the overlay and readouts
  // change only at a new viewpoint (WalkPlayback), so the page never re-renders per frame.
  useEffect(() => {
    if (!playing || !computed) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // rAF timestamps can precede the performance.now() taken when the effect ran.
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      if (!playback.advance(dt * WALK_PACE_MPS * speed)) {
        setPlayingState(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [computed, playback, playing, speed]);

  const setPlaying = useCallback(
    (on: boolean) => {
      if (on && computed && playback.atEnd) playback.restart();
      setPlayingState(on);
    },
    [computed, playback],
  );

  const seek = useCallback(
    (i: number) => {
      if (computed) playback.seekIndex(i);
    },
    [computed, playback],
  );

  const status: WalkStatus = computing ? "computing" : computed ? "ready" : samples.length >= 2 ? "drawn" : "empty";
  const stale = !!computed && (computed.eyeM !== eyeM || computed.radiusM !== radiusM);

  return {
    layer,
    drawing,
    setDrawing,
    addPoint,
    clear,
    clickCount: points.length,
    sampleCount: samples.length,
    lengthM: spline.lengthM,
    eyeM,
    setEyeM,
    radiusM,
    setRadiusM,
    status,
    stale,
    progress,
    computeMs,
    compute,
    playback,
    seek,
    playing,
    setPlaying,
    speed,
    setSpeed,
  };
}
