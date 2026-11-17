import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CityModel, Pt } from "../types";
import { colourRgb, getColour, type ColourKey } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { downwindFromSector, sectorLabel } from "../lib/windRose";
import {
  bilinearSample,
  rampRgb,
  windPlanImageUpscale,
  windPlanRampStops,
  type WindPlanComfort,
  type WindPlanSpeed,
} from "../lib/windPlanField";
import { windPlanComfortBands, windPlanSpeedContours, type WorldRing } from "../lib/windPlanContours";
import { windPlanLineStyle, type WindPlanLineStyle, type WindPlanPen } from "../lib/windPlanStyle";
import { placeWindArrow, type ScreenRect, type WindArrowLayout } from "../lib/windPlanArrow";
import { WIND_PLAN_HUD_EVENT } from "../lib/windPlanLegendLayout";
import type { WindPlanState } from "./useWindPlan";

export type WindPlanTransform = { ox: number; oy: number; exX: number; exY: number; enX: number; enY: number };

export type WindPlanTransformStore = {
  get: () => WindPlanTransform | null;
  set: (next: WindPlanTransform) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createWindPlanTransformStore(): WindPlanTransformStore {
  let current: WindPlanTransform | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (
        current &&
        Math.abs(current.ox - next.ox) < 0.01 &&
        Math.abs(current.oy - next.oy) < 0.01 &&
        Math.abs(current.exX - next.exX) < 1e-6 &&
        Math.abs(current.exY - next.exY) < 1e-6 &&
        Math.abs(current.enX - next.enX) < 1e-6 &&
        Math.abs(current.enY - next.enY) < 1e-6
      ) {
        return;
      }
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function WindPlanProjector({ store }: { store: WindPlanTransformStore }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const rect = gl.domElement.getBoundingClientRect();
    const project = (east: number, north: number) => {
      point.set(east, 0, -north).project(camera);
      return { x: rect.left + (point.x * 0.5 + 0.5) * rect.width, y: rect.top + (-point.y * 0.5 + 0.5) * rect.height };
    };
    const o = project(0, 0);
    const e = project(1, 0);
    const n = project(0, 1);
    store.set({ ox: o.x, oy: o.y, exX: e.x - o.x, exY: e.y - o.y, enX: n.x - o.x, enY: n.y - o.y });
  });
  return null;
}

const COMFORT_FILL: Record<"standing" | "walking" | "uncomfortable" | "unsafe", ColourKey> = {
  standing: "--wind-plan-standing",
  walking: "--wind-plan-walking",
  uncomfortable: "--wind-plan-uncomfortable",
  unsafe: "--wind-plan-unsafe",
};

const ARROW_CHIP_HEIGHT_PX = 20;
const ARROW_CHIP_PAD_PX = 12;
const ARROW_CHIP_FONT = "600 11px Geist, system-ui, sans-serif";
const VIEW_INSET_PX = 14;
const HUD_SELECTOR = ".hud-card, .studio-compass";

const speedImages = new WeakMap<WindPlanSpeed, { revision: number; canvas: HTMLCanvasElement }>();

function speedImage(speed: WindPlanSpeed, revision: number): HTMLCanvasElement {
  const cached = speedImages.get(speed);
  if (cached && cached.revision === revision) return cached.canvas;
  const { cols, rows } = speed.geometry;
  const up = windPlanImageUpscale(cols, rows);
  const width = cols * up;
  const height = rows * up;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const stops = windPlanRampStops(colourRgb);
  const rgb: [number, number, number] = [0, 0, 0];
  for (let py = 0; py < height; py++) {
    const gy = (py + 0.5) / up - 0.5;
    for (let px = 0; px < width; px++) {
      rampRgb(stops, bilinearSample(speed.speedMs, cols, rows, (px + 0.5) / up - 0.5, gy), rgb);
      const at = (py * width + px) * 4;
      image.data[at] = rgb[0];
      image.data[at + 1] = rgb[1];
      image.data[at + 2] = rgb[2];
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  speedImages.set(speed, { revision, canvas });
  return canvas;
}

function ringsPath(rings: readonly WorldRing[]): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    path.moveTo(ring[0]!, ring[1]!);
    for (let k = 2; k < ring.length; k += 2) path.lineTo(ring[k]!, ring[k + 1]!);
    path.closePath();
  }
  return path;
}

const pathCache = new WeakMap<object, Path2D>();

function cachedPath(owner: object, rings: () => readonly WorldRing[]): Path2D {
  let path = pathCache.get(owner);
  if (!path) {
    path = ringsPath(rings());
    pathCache.set(owner, path);
  }
  return path;
}

function signedArea(ring: readonly Pt[]): number {
  let sum = 0;
  for (let k = 0; k < ring.length; k++) {
    const [ax, ay] = ring[k]!;
    const [bx, by] = ring[(k + 1) % ring.length]!;
    sum += ax * by - bx * ay;
  }
  return sum / 2;
}

type BuildingShapes = { path: Path2D; boxes: Array<[number, number, number, number]> };

function buildingShapes(model: CityModel): BuildingShapes {
  const path = new Path2D();
  const boxes: Array<[number, number, number, number]> = [];
  const trace = (ring: readonly Pt[], reverse: boolean) => {
    const points = reverse ? [...ring].reverse() : ring;
    points.forEach(([e, n], k) => {
      if (k === 0) path.moveTo(e, n);
      else path.lineTo(e, n);
    });
    path.closePath();
  };
  for (const building of model.buildings) {
    const ring = building.ring;
    if (ring.length < 3) continue;
    let minE = Infinity;
    let minN = Infinity;
    let maxE = -Infinity;
    let maxN = -Infinity;
    for (const [e, n] of ring) {
      minE = Math.min(minE, e);
      maxE = Math.max(maxE, e);
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
    }
    const outerSign = Math.sign(signedArea(ring));
    trace(ring, false);
    for (const hole of building.holes ?? []) {
      if (hole.length >= 3) trace(hole, Math.sign(signedArea(hole)) === outerSign);
    }
    boxes.push([minE, minN, maxE, maxN]);
  }
  return { path, boxes };
}

function clampInside(value: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value));
}

type CutExtent = { minE: number; minN: number; maxE: number; maxN: number };

function cutExtent(model: CityModel): CutExtent {
  const w = model.widthM ?? model.sideM;
  const h = model.heightM ?? model.sideM;
  return { minE: -w / 2, minN: -h / 2, maxE: w / 2, maxN: h / 2 };
}

function strokePen(ctx: CanvasRenderingContext2D, path: Path2D, pen: WindPlanPen, scale: number) {
  ctx.globalAlpha = pen.opacity;
  ctx.strokeStyle = pen.colour;
  ctx.lineWidth = pen.px / scale;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
}

function strokeInside(ctx: CanvasRenderingContext2D, path: Path2D, pen: WindPlanPen, scale: number) {
  ctx.save();
  ctx.clip(path, "nonzero");
  strokePen(ctx, path, { ...pen, px: pen.px * 2 }, scale);
  ctx.restore();
}

function hatch(ctx: CanvasRenderingContext2D, width: number, height: number, style: WindPlanLineStyle, dpr: number) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = style.unsafeHatch.colour;
  ctx.lineWidth = style.unsafeHatch.px;
  const step = style.hatchSpacingPx * Math.SQRT2;
  ctx.beginPath();
  for (let c = 0; c <= width + height; c += step) {
    ctx.moveTo(c, 0);
    ctx.lineTo(c - height, height);
  }
  ctx.stroke();
  ctx.restore();
}

function sameArrow(a: WindArrowLayout | null, b: WindArrowLayout | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.tail.x - b.tail.x) < 0.5 &&
    Math.abs(a.tail.y - b.tail.y) < 0.5 &&
    Math.abs(a.head.x - b.head.x) < 0.5 &&
    Math.abs(a.head.y - b.head.y) < 0.5 &&
    a.chip.x1 - a.chip.x0 === b.chip.x1 - b.chip.x0
  );
}

export function WindPlanOverlay({
  model,
  plan,
  store,
}: {
  model: CityModel;
  plan: WindPlanState;
  store: WindPlanTransformStore;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colourRevision = useColourRevision();
  const [arrow, setArrow] = useState<WindArrowLayout | null>(null);
  const buildings = useMemo(() => buildingShapes(model), [model]);
  const cut = useMemo(() => cutExtent(model), [model]);
  const { mode, speed, comfort, sector } = plan;
  const arrowLabel = sector != null ? `Wind ${sectorLabel(sector)}` : "";

  const draw = useCallback(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const t = store.get();
    if (!host || !canvas || !t) return;
    const rect = host.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const data: WindPlanSpeed | WindPlanComfort | null = mode === "speed" ? speed : comfort;
    if (!data) {
      setArrow(null);
      return;
    }
    const style = windPlanLineStyle();
    const ox = t.ox - rect.left;
    const oy = t.oy - rect.top;
    const scale = Math.hypot(t.exX, t.exY) || 1;
    const worldTransform = () => ctx.setTransform(dpr * t.exX, dpr * t.exY, dpr * t.enX, dpr * t.enY, dpr * ox, dpr * oy);
    const { cols, rows, cellM, originE, originN } = data.geometry;
    const gridW = cols * cellM;
    const gridH = rows * cellM;

    ctx.save();
    worldTransform();
    ctx.beginPath();
    ctx.rect(cut.minE, cut.minN, cut.maxE - cut.minE, cut.maxN - cut.minN);
    ctx.clip();

    if (mode === "speed" && speed) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(speedImage(speed, colourRevision), originE, originN, gridW, gridH);
      ctx.save();
      ctx.beginPath();
      ctx.rect(originE + cellM / 2, originN + cellM / 2, gridW - cellM, gridH - cellM);
      ctx.clip();
      const levels = windPlanSpeedContours(speed);
      strokePen(ctx, cachedPath(levels, () => levels.flat()), style.contour, scale);
      ctx.restore();
    } else if (mode === "comfort" && comfort) {
      ctx.fillStyle = getColour("--wind-plan-sitting");
      ctx.fillRect(originE, originN, gridW, gridH);
      for (const layer of windPlanComfortBands(comfort)) {
        if (layer.rings.length === 0) continue;
        const path = cachedPath(layer, () => layer.rings);
        ctx.fillStyle = getColour(COMFORT_FILL[layer.band]);
        ctx.fill(path, "evenodd");
        if (layer.band !== "unsafe") continue;
        ctx.save();
        ctx.clip(path, "evenodd");
        hatch(ctx, rect.width, rect.height, style, dpr);
        ctx.restore();
        strokePen(ctx, path, style.unsafeOutline, scale);
      }
      const minPx = style.unsafeMinPx;
      for (const area of comfort.unsafeAreas) {
        const extentM = Math.max(area.maxI - area.minI + 1, area.maxJ - area.minJ + 1) * cellM;
        if (extentM * scale >= minPx) continue;
        const radius = minPx / 2 / scale;
        const inset = radius + style.unsafeOutline.px / 2 / scale;
        const e = clampInside(originE + (area.sumI / area.cells + 0.5) * cellM, cut.minE + inset, cut.maxE - inset);
        const n = clampInside(originN + (area.sumJ / area.cells + 0.5) * cellM, cut.minN + inset, cut.maxN - inset);
        const disc = new Path2D();
        disc.arc(e, n, radius, 0, Math.PI * 2);
        ctx.fillStyle = getColour("--wind-plan-unsafe");
        ctx.fill(disc);
        ctx.save();
        ctx.clip(disc);
        hatch(ctx, rect.width, rect.height, style, dpr);
        ctx.restore();
        strokePen(ctx, disc, style.unsafeOutline, scale);
      }
    }

    ctx.fillStyle = getColour("--wind-plan-building");
    ctx.fill(buildings.path, "nonzero");
    strokeInside(ctx, buildings.path, style.buildingEdge, scale);
    ctx.restore();

    if (mode !== "speed" || sector == null) {
      setArrow(null);
      return;
    }
    const wind = downwindFromSector(sector);
    const downwind = { x: t.exX * wind.east + t.enX * wind.north, y: t.exY * wind.east + t.enY * wind.north };
    const toScreen = (e: number, n: number) => ({ x: ox + e * t.exX + n * t.enX, y: oy + e * t.exY + n * t.enY });
    const map = [toScreen(cut.minE, cut.minN), toScreen(cut.maxE, cut.minN), toScreen(cut.maxE, cut.maxN), toScreen(cut.minE, cut.maxN)];
    ctx.font = ARROW_CHIP_FONT;
    const chipW = Math.ceil(ctx.measureText(arrowLabel).width) + ARROW_CHIP_PAD_PX;
    const panels: ScreenRect[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(HUD_SELECTOR)) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      panels.push({ x0: r.left - rect.left, y0: r.top - rect.top, x1: r.right - rect.left, y1: r.bottom - rect.top });
    }
    const buildingRects: ScreenRect[] = [];
    for (const [minE, minN, maxE, maxN] of buildings.boxes) {
      const corners = [toScreen(minE, minN), toScreen(maxE, minN), toScreen(maxE, maxN), toScreen(minE, maxN)];
      const x0 = Math.min(...corners.map((p) => p.x));
      const x1 = Math.max(...corners.map((p) => p.x));
      const y0 = Math.min(...corners.map((p) => p.y));
      const y1 = Math.max(...corners.map((p) => p.y));
      if (x1 < 0 || y1 < 0 || x0 > rect.width || y0 > rect.height) continue;
      buildingRects.push({ x0, y0, x1, y1 });
    }
    const view = { x0: VIEW_INSET_PX, y0: VIEW_INSET_PX, x1: rect.width - VIEW_INSET_PX, y1: rect.height - VIEW_INSET_PX };
    const next = placeWindArrow({ view, map, downwind, chipW, chipH: ARROW_CHIP_HEIGHT_PX, panels, buildings: buildingRects });
    setArrow((prev) => (sameArrow(prev, next) ? prev : next));
  }, [store, mode, speed, comfort, sector, buildings, cut, colourRevision, arrowLabel]);

  const frame = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      draw();
    });
  }, [draw]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const unsubscribe = store.subscribe(schedule);
    const host = hostRef.current;
    const observer = typeof ResizeObserver !== "undefined" && host ? new ResizeObserver(schedule) : null;
    if (observer && host) observer.observe(host);
    window.addEventListener("resize", schedule);
    window.addEventListener(WIND_PLAN_HUD_EVENT, schedule);
    return () => {
      unsubscribe();
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener(WIND_PLAN_HUD_EVENT, schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [store, schedule]);

  const headPoints = useMemo(() => {
    if (!arrow) return "";
    const dx = arrow.head.x - arrow.tail.x;
    const dy = arrow.head.y - arrow.tail.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const back = 10;
    const half = 5;
    const bx = arrow.head.x - ux * back;
    const by = arrow.head.y - uy * back;
    return `${arrow.head.x},${arrow.head.y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
  }, [arrow]);

  return (
    <div ref={hostRef} className="wind-plan-overlay" aria-hidden="true" data-wind-plan-mode={mode}>
      <canvas ref={canvasRef} className="wind-plan-canvas" />
      {arrow ? (
        <>
          <svg className="wind-plan-arrow" data-clear={arrow.clear ? "1" : "0"}>
            <line
              className="wind-plan-arrow-shaft"
              x1={arrow.tail.x}
              y1={arrow.tail.y}
              x2={arrow.head.x - (arrow.head.x - arrow.tail.x) * 0.15}
              y2={arrow.head.y - (arrow.head.y - arrow.tail.y) * 0.15}
            />
            <polygon className="wind-plan-arrow-head" points={headPoints} />
          </svg>
          <span
            className="wind-plan-arrow-chip"
            style={{
              left: arrow.chip.x0,
              top: arrow.chip.y0,
              width: arrow.chip.x1 - arrow.chip.x0,
              height: arrow.chip.y1 - arrow.chip.y0,
            }}
          >
            {arrowLabel}
          </span>
        </>
      ) : null}
    </div>
  );
}
