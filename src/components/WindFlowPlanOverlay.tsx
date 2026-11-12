import { useEffect, useMemo, useRef } from "react";
import { cssColorToHex } from "../lib/cssVars";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { flowVisualNormSpeed } from "../lib/windLbm/flowVisualNorm";
import type { WindLbmSolverState } from "../lib/windLbm/types";
import { WIND_TRAIL_SAMPLES, type WindFlowParticle } from "../lib/windLbm/windParticles";

function hexChannels(hex: string | null): [number, number, number] {
  if (!hex) return [0, 0, 0];
  const body = hex.replace("#", "");
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

type CutLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function cutLayoutFromSvg(svg: SVGSVGElement, host: DOMRect, half: number): CutLayout | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const corners = [
    new DOMPoint(-half, -half),
    new DOMPoint(half, -half),
    new DOMPoint(half, half),
    new DOMPoint(-half, half),
  ].map((p) => p.matrixTransform(ctm));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs) - host.left;
  const top = Math.min(...ys) - host.top;
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width < 8 || height < 8) return null;
  return { left, top, width, height };
}

function eastNorthToCutPx(east: number, north: number, half: number, w: number, h: number): [number, number] {
  const px = ((east + half) / (half * 2)) * w;
  const py = ((-north) + half) / (half * 2) * h;
  return [px, py];
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  state: WindLbmSolverState,
  half: number,
  width: number,
  height: number,
  calm: string,
  fast: string,
) {
  const { spec, obstacle, ux, uy } = state;
  const norm = flowVisualNormSpeed(state);
  const wakeT = 0.1;
  const calmRgb = hexChannels(cssColorToHex(calm));
  const fastRgb = hexChannels(cssColorToHex(fast));
  const img = ctx.createImageData(width, height);
  const data = img.data;
  for (let py = 0; py < height; py++) {
    const north = half - (py + 0.5) / height * (half * 2);
    for (let px = 0; px < width; px++) {
      const east = -half + ((px + 0.5) / width) * (half * 2);
      const fx = ((east + half) / spec.sideM) * spec.nx;
      const fy = ((north + half) / spec.sideM) * spec.ny;
      const i = Math.min(spec.nx - 1, Math.max(0, Math.floor(fx)));
      const j = Math.min(spec.ny - 1, Math.max(0, Math.floor(fy)));
      const cell = i + j * spec.nx;
      const o = (py * width + px) * 4;
      if (obstacle[cell]) {
        data[o + 3] = 0;
        continue;
      }
      const speed = Math.hypot(ux[cell]!, uy[cell]!);
      const t = Math.min(1, speed / norm);
      const tw = wakeT + t * (1 - wakeT);
      data[o] = Math.round(calmRgb[0] * (1 - tw) + fastRgb[0] * tw);
      data[o + 1] = Math.round(calmRgb[1] * (1 - tw) + fastRgb[1] * tw);
      data[o + 2] = Math.round(calmRgb[2] * (1 - tw) + fastRgb[2] * tw);
      data[o + 3] = Math.round(100 + tw * 132);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function strokeTrailSegments(
  ctx: CanvasRenderingContext2D,
  p: WindFlowParticle,
  half: number,
  layoutW: number,
  layoutH: number,
  maxSegM: number,
  streak: string,
  streakBright: string,
) {
  const trail: { east: number; north: number }[] = [];
  const drawSamples = Math.min(WIND_TRAIL_SAMPLES, 11);
  for (let t = 0; t < drawSamples; t++) {
    const idx = (p.trailHead - t + WIND_TRAIL_SAMPLES) % WIND_TRAIL_SAMPLES;
    const east = p.trailEast[idx]!;
    const north = p.trailNorth[idx]!;
    if (Math.abs(east) > half || Math.abs(north) > half) continue;
    trail.push({ east, north });
  }
  if (trail.length < 2) return;
  const segments: { east: number; north: number }[][] = [];
  let current: { east: number; north: number }[] = [trail[trail.length - 1]!];
  for (let i = trail.length - 2; i >= 0; i--) {
    const a = current[current.length - 1]!;
    const b = trail[i]!;
    const jump = Math.hypot(a.east - b.east, a.north - b.north);
    if (jump > maxSegM) {
      if (current.length >= 2) segments.push(current);
      current = [b];
    } else {
      current.push(b);
    }
  }
  if (current.length >= 2) segments.push(current);
  for (const seg of segments) {
    if (seg.length < 2) continue;
    const headPx = eastNorthToCutPx(seg[0]!.east, seg[0]!.north, half, layoutW, layoutH);
    const tailPx = eastNorthToCutPx(seg[seg.length - 1]!.east, seg[seg.length - 1]!.north, half, layoutW, layoutH);
    const grad = ctx.createLinearGradient(headPx[0], headPx[1], tailPx[0], tailPx[1]);
    grad.addColorStop(0, streakBright);
    grad.addColorStop(1, streak);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.95;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tailPx[0], tailPx[1]);
    for (let i = seg.length - 2; i >= 0; i--) {
      const pt = eastNorthToCutPx(seg[i]!.east, seg[i]!.north, half, layoutW, layoutH);
      const fade = 1 - i / Math.max(1, seg.length - 1);
      ctx.globalAlpha = 0.38 + fade * 0.55;
      ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();
  }
}

export function WindFlowPlanOverlay({
  sideM,
  solver,
  particles,
  frame,
  showHeatmap,
  backend,
  flowReveal = 1,
  normSpeed,
}: {
  sideM: number;
  solver: WindLbmSolverState | null;
  particles: readonly WindFlowParticle[];
  frame: number;
  showHeatmap: boolean;
  backend: string;
  flowReveal?: number;
  normSpeed: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLParagraphElement>(null);
  const colourTick = useColourRevision();
  const half = sideM / 2;
  const streak = useMemo(() => getColour("--wind-flow-streak"), [colourTick]);
  const streakBright = useMemo(() => getColour("--wind-flow-streak-bright"), [colourTick]);
  const heatCalm = useMemo(() => getColour("--wind-flow-heatmap-calm"), [colourTick]);
  const heatFast = useMemo(() => getColour("--wind-flow-heatmap-fast"), [colourTick]);
  const legendInk = useMemo(() => getColour("--wind-flow-legend-ink"), [colourTick]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const svg = host.closest(".fill.is-plan")?.querySelector("svg.plan") as SVGSVGElement | null;
    if (!svg) return;
    const hostRect = host.getBoundingClientRect();
    const layout = cutLayoutFromSvg(svg, hostRect, half);
    if (!layout) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pxW = Math.max(1, Math.round(layout.width * dpr));
    const pxH = Math.max(1, Math.round(layout.height * dpr));
    canvas.style.left = `${layout.left}px`;
    canvas.style.top = `${layout.top}px`;
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    if (solver && showHeatmap) {
      drawHeatmap(ctx, solver, half, layout.width, layout.height, heatCalm, heatFast);
    }
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const maxSegM =
      solver != null ? (solver.spec.sideM / solver.spec.nx) * 3.2 : (sideM / 256) * 3.2;
    for (const p of particles) {
      const localSpeed = Math.hypot(p.lastUx, p.lastUy);
      const alphaScale = 0.35 + 0.65 * Math.min(1.3, localSpeed / Math.max(normSpeed, 1e-4));
      ctx.globalAlpha = flowReveal * alphaScale;
      strokeTrailSegments(ctx, p, half, layout.width, layout.height, maxSegM, streak, streakBright);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    const legend = legendRef.current;
    if (legend) {
      legend.style.left = `${layout.left + layout.width * 0.5}px`;
      legend.style.top = `${layout.top + layout.height - 8}px`;
      legend.style.bottom = "auto";
      legend.style.transform = "translate(-50%, -100%)";
      legend.style.maxWidth = `${Math.min(420, layout.width - 24)}px`;
    }
  }, [solver, particles, frame, showHeatmap, streak, streakBright, heatCalm, heatFast, half, sideM, flowReveal, normSpeed]);

  return (
    <div ref={hostRef} className="wind-flow-plan-overlay" data-frame={frame} data-backend={backend} aria-hidden="true">
      <canvas ref={canvasRef} className="wind-flow-plan-canvas" />
      <p ref={legendRef} className="wind-flow-legend" style={{ color: legendInk }}>
        Indicative ground-level 2D flow around cut footprints — not engineering CFD.
      </p>
    </div>
  );
}
