import { useEffect, useMemo, useRef } from "react";
import { cssColorToHex } from "../lib/cssVars";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { PlanViewport } from "../lib/planViewport";
import type { WindLbmSolverState } from "../lib/windLbm/types";
import type { WindFlowParticle } from "../lib/windLbm/windParticles";

function hexChannels(hex: string | null): [number, number, number] {
  if (!hex) return [0, 0, 0];
  const body = hex.replace("#", "");
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  state: WindLbmSolverState,
  view: PlanViewport,
  width: number,
  height: number,
  calm: string,
  fast: string,
) {
  const { spec, obstacle, ux, uy } = state;
  const half = spec.sideM / 2;
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
    const north = view.y + ((py + 0.5) / height) * view.h;
    const ny = -north;
    for (let px = 0; px < width; px++) {
      const east = view.x + ((px + 0.5) / width) * view.w;
      const fx = ((east + half) / spec.sideM) * spec.nx;
      const fy = ((ny + half) / spec.sideM) * spec.ny;
      const i = Math.min(spec.nx - 1, Math.max(0, Math.floor(fx)));
      const j = Math.min(spec.ny - 1, Math.max(0, Math.floor(fy)));
      const cell = i + j * spec.nx;
      const o = (py * width + px) * 4;
      if (obstacle[cell] || east < -half || east > half || ny < -half || ny > half) {
        data[o + 3] = 0;
        continue;
      }
      const t = Math.min(1, Math.hypot(ux[cell]!, uy[cell]!) / maxSpeed);
      data[o] = Math.round(calmRgb[0] * (1 - t) + fastRgb[0] * t);
      data[o + 1] = Math.round(calmRgb[1] * (1 - t) + fastRgb[1] * t);
      data[o + 2] = Math.round(calmRgb[2] * (1 - t) + fastRgb[2] * t);
      data[o + 3] = Math.round(38 + t * 70);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function worldToCanvas(
  east: number,
  north: number,
  view: PlanViewport,
  width: number,
  height: number,
): [number, number] | null {
  if (east < view.x || east > view.x + view.w) return null;
  const plotNorth = -north;
  if (plotNorth < view.y || plotNorth > view.y + view.h) return null;
  const px = ((east - view.x) / view.w) * width;
  const py = ((plotNorth - view.y) / view.h) * height;
  return [px, py];
}

export function WindFlowPlanOverlay({
  view,
  sideM,
  solver,
  particles,
  frame,
  showHeatmap,
  backend,
}: {
  view: PlanViewport;
  sideM: number;
  solver: WindLbmSolverState | null;
  particles: readonly WindFlowParticle[];
  frame: number;
  showHeatmap: boolean;
  backend: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colourTick = useColourRevision();
  const streak = useMemo(() => getColour("--wind-flow-streak"), [colourTick]);
  const streakBright = useMemo(() => getColour("--wind-flow-streak-bright"), [colourTick]);
  const heatCalm = useMemo(() => getColour("--wind-flow-heatmap-calm"), [colourTick]);
  const heatFast = useMemo(() => getColour("--wind-flow-heatmap-fast"), [colourTick]);
  const legendInk = useMemo(() => getColour("--wind-flow-legend-ink"), [colourTick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (solver && showHeatmap) {
      drawHeatmap(ctx, solver, view, width, height, heatCalm, heatFast);
    }
    ctx.lineCap = "round";
    const tailLen = sideM * 0.028;
    for (const p of particles) {
      const pos = worldToCanvas(p.east, p.north, view, width, height);
      if (!pos) continue;
      const speed = Math.hypot(p.lastUx, p.lastUy) || 0.02;
      const tailEast = p.east - (p.lastUx / speed) * tailLen;
      const tailNorth = p.north - (p.lastUy / speed) * tailLen;
      const tail = worldToCanvas(tailEast, tailNorth, view, width, height);
      const grad = ctx.createLinearGradient(pos[0], pos[1], tail?.[0] ?? pos[0], tail?.[1] ?? pos[1]);
      grad.addColorStop(0, streakBright);
      grad.addColorStop(1, streak);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.35 + (1 - p.age / 2.8) * 0.55;
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      if (tail) {
        ctx.moveTo(tail[0], tail[1]);
        ctx.lineTo(pos[0], pos[1]);
      } else {
        ctx.arc(pos[0], pos[1], 1.5, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [solver, particles, frame, view, showHeatmap, streak, streakBright, heatCalm, heatFast, sideM]);

  return (
    <div className="wind-flow-plan-overlay" data-frame={frame} data-backend={backend} aria-hidden="true">
      <canvas ref={canvasRef} className="wind-flow-plan-canvas" />
      <p className="wind-flow-legend" style={{ color: legendInk }}>
        Indicative ground-level 2D flow around cut footprints — not engineering CFD.
      </p>
    </div>
  );
}
