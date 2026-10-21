import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHeightGrid,
  groundHeightAt,
  spacedSplineSamples,
  frameVisibleShare,
  viewshedFrame,
  walkGridBox,
  CELL_VISIBLE,
  VIEWSHED_DEFAULT_EYE_M,
  VIEWSHED_DEFAULT_RADIUS_M,
  VIEWSHED_SAMPLE_SPACING_M,
  type HeightGrid,
} from "../lib/viewshed";
import type { ViewshedWorkerMessage, ViewshedWorkerRequest } from "../lib/viewshed.worker";
import { WalkViewshedLayer } from "../lib/walkViewshedLayer";
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
  index: number;
  seek: (index: number) => void;
  playing: boolean;
  setPlaying: (on: boolean) => void;
  speed: WalkSpeed;
  setSpeed: (speed: WalkSpeed) => void;
  visiblePercent: number | null;
  seenHa: number | null;
  distanceM: number;
};

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

  const [points, setPoints] = useState<Pt[]>([]);
  const [drawing, setDrawingState] = useState(false);
  const [eyeM, setEyeMState] = useState(VIEWSHED_DEFAULT_EYE_M);
  const [radiusM, setRadiusM] = useState(VIEWSHED_DEFAULT_RADIUS_M);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [computeMs, setComputeMs] = useState<number | null>(null);
  const [computed, setComputed] = useState<Computed | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeed] = useState<WalkSpeed>(4);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<number | null>(null);
  const seenRef = useRef<{ upTo: number; cells: Uint8Array } | null>(null);

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
    setIndex(0);
    setPlayingState(false);
    seenRef.current = null;
    layer.setGrid(null);
    layer.setWalker(null, 0);
  }, [layer, stopCompute]);

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
      setProgress(done / frames.length);
      if (i === 0) setIndex(0);
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
  }, [analysisModel, eyeM, layer, model, radiusM, resetResult, samples]);

  // Seen-so-far: cells visible from any sample up to the current one.
  const seenCells = useCallback(
    (upTo: number): Uint8Array | null => {
      if (!computed) return null;
      let seen = seenRef.current;
      if (!seen || seen.upTo > upTo) {
        seen = { upTo: -1, cells: new Uint8Array(computed.grid.cols * computed.grid.rows) };
      }
      for (let i = seen.upTo + 1; i <= upTo; i++) {
        const frame = computed.frames[i];
        if (!frame) break;
        for (let k = 0; k < frame.length; k++) if (frame[k] === CELL_VISIBLE) seen.cells[k] = 1;
        seen.upTo = i;
      }
      seenRef.current = seen;
      return seen.cells;
    },
    [computed],
  );

  const frame = computed?.frames[index] ?? null;
  const [stats, setStats] = useState<{ visiblePercent: number | null; seenHa: number | null }>({ visiblePercent: null, seenHa: null });

  // Paint the overlay and walker for the current sample.
  useEffect(() => {
    if (!computed || !frame) {
      setStats({ visiblePercent: null, seenHa: null });
      return;
    }
    const seen = seenCells(index);
    layer.paint(frame, seen);
    const at = samples[index] ?? null;
    layer.setWalker(at, computed.eyeM);
    let seenCount = 0;
    if (seen) for (let k = 0; k < seen.length; k++) seenCount += seen[k]!;
    const cellArea = computed.grid.cell * computed.grid.cell;
    setStats({ visiblePercent: frameVisibleShare(frame).percent, seenHa: (seenCount * cellArea) / 10_000 });
  }, [computed, frame, index, layer, samples, seenCells, progress]);

  // Playback: time based, so the pace holds whatever the frame rate.
  useEffect(() => {
    if (!playing || !computed || samples.length < 2) return;
    const step = spline.lengthM / (samples.length - 1);
    let last = performance.now();
    let carry = 0;
    let raf = 0;
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * WALK_PACE_MPS * speed;
      last = now;
      const advance = Math.floor(carry / step);
      if (advance > 0) {
        carry -= advance * step;
        setIndex((i) => {
          const next = i + advance;
          const ready = computed.frames.findIndex((f) => !f);
          const limit = ready === -1 ? samples.length - 1 : Math.max(0, ready - 1);
          if (next >= samples.length - 1 && ready === -1) {
            setPlayingState(false);
            return samples.length - 1;
          }
          return Math.min(next, limit);
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [computed, playing, samples.length, speed, spline.lengthM]);

  const setPlaying = useCallback(
    (on: boolean) => {
      if (on && computed && index >= samples.length - 1) setIndex(0);
      setPlayingState(on);
    },
    [computed, index, samples.length],
  );

  const seek = useCallback(
    (i: number) => {
      if (!computed) return;
      setIndex(Math.max(0, Math.min(samples.length - 1, Math.round(i))));
    },
    [computed, samples.length],
  );

  const status: WalkStatus = computing ? "computing" : computed ? "ready" : samples.length >= 2 ? "drawn" : "empty";
  const stale = !!computed && (computed.eyeM !== eyeM || computed.radiusM !== radiusM);
  const distanceM = samples.length > 1 ? (spline.lengthM * index) / (samples.length - 1) : 0;

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
    index,
    seek,
    playing,
    setPlaying,
    speed,
    setSpeed,
    visiblePercent: stats.visiblePercent,
    seenHa: stats.seenHa,
    distanceM,
  };
}
