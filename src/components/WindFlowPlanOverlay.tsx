import { useEffect, useMemo, useRef } from "react";
import { cssColorToHex } from "../lib/cssVars";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
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
  let maxSpeed = 0.001;
  for (let i = 0; i < ux.length; i++) {
    if (obstacle[i]) continue;
    maxSpeed = Math.max(maxSpeed, Math.hypot(ux[i]!, uy[i]!));
  }
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
      const t = Math.min(1, Math.hypot(ux[cell]!, uy[cell]!) / maxSpeed);
      data[o] = Math.round(calmRgb[0] * (1 - t) + fastRgb[0] * t);
      data[o + 1] = Math.round(calmRgb[1] * (1 - t) + fastRgb[1] * t);
      data[o + 2] = Math.round(calmRgb[2] * (1 - t) + fastRgb[2] * t);
      data[o + 3] = Math.round(42 + t * 78);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function WindFlowPlanOverlay({
  sideM,
  solver,
  particles,
  frame,
  showHeatmap,
  backend,
}: {
  sideM: number;
  solver: WindLbmSolverState | null;
  particles: readonly WindFlowParticle[];
  frame: number;
  showHeatmap: boolean;
  backend: string;
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const p of particles) {
      const points: [number, number][] = [];
      for (let t = 0; t < WIND_TRAIL_SAMPLES; t++) {
        const idx = (p.trailHead - t + WIND_TRAIL_SAMPLES) % WIND_TRAIL_SAMPLES;
        const east = p.trailEast[idx]!;
        const north = p.trailNorth[idx]!;
        if (Math.abs(east) > half || Math.abs(north) > half) continue;
        points.push(eastNorthToCutPx(east, north, half, layout.width, layout.height));
      }
      if (points.length < 2) continue;
      const head = points[0]!;
      const tail = points[points.length - 1]!;
      if (
        !Number.isFinite(head[0]) ||
        !Number.isFinite(head[1]) ||
        !Number.isFinite(tail[0]) ||
        !Number.isFinite(tail[1])
      ) {
        continue;
      }
      const grad = ctx.createLinearGradient(head[0], head[1], tail[0], tail[1]);
      grad.addColorStop(0, streakBright);
      grad.addColorStop(1, streak);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(points[points.length - 1]![0], points[points.length - 1]![1]);
      for (let i = points.length - 2; i >= 0; i--) {
        const pt = points[i]!;
        const fade = 1 - i / Math.max(1, points.length - 1);
        ctx.globalAlpha = 0.18 + fade * 0.72;
        ctx.lineTo(pt[0], pt[1]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const legend = legendRef.current;
    if (legend) {
      legend.style.left = `${layout.left + layout.width * 0.5}px`;
      legend.style.top = `${layout.top + layout.height - 8}px`;
      legend.style.bottom = "auto";
      legend.style.transform = "translate(-50%, -100%)";
      legend.style.maxWidth = `${Math.min(420, layout.width - 24)}px`;
    }
  }, [solver, particles, frame, showHeatmap, streak, streakBright, heatCalm, heatFast, half, sideM]);

  return (
    <div ref={hostRef} className="wind-flow-plan-overlay" data-frame={frame} data-backend={backend} aria-hidden="true">
      <canvas ref={canvasRef} className="wind-flow-plan-canvas" />
      <p ref={legendRef} className="wind-flow-legend" style={{ color: legendInk }}>
        Indicative ground-level 2D flow around cut footprints — not engineering CFD.
      </p>
    </div>
  );
}
