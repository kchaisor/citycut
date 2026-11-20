import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityModel, Pt } from "../types";
import { colourRgb, getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import {
  bilinearSample,
  rampRgb,
  windPlanImageUpscale,
  windPlanRampStops,
  type WindPlanComfort,
  type WindPlanSpeed,
} from "../lib/windPlanField";
import { windPlanSpeedContours, windPlanUnsafeRings, type WorldRing } from "../lib/windPlanContours";
import { COMFORT_CLASSES, lawsonClass, type ComfortClass } from "../lib/windComfort";
import { COMFORT_SWATCH } from "./WindPlanCard";
import { cutExtent, pointInClip, windPlanSiteClip } from "../lib/windPlanSiteClip";
import { dashSegments, readDrawingStyle } from "../lib/drawingStyle";
import { screenDashPx, screenPx } from "../lib/lineweights";
import { windPlanLineStyle, type WindPlanLineStyle, type WindPlanPen } from "../lib/windPlanStyle";
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

const comfortImages = new WeakMap<WindPlanComfort, { revision: number; canvas: HTMLCanvasElement }>();

function comfortImage(comfort: WindPlanComfort, revision: number): HTMLCanvasElement {
  const cached = comfortImages.get(comfort);
  if (cached && cached.revision === revision) return cached.canvas;
  const { cols, rows } = comfort.geometry;
  const { p4, p6, p8, p10 } = comfort.fields;
  const up = windPlanImageUpscale(cols, rows);
  const width = cols * up;
  const height = rows * up;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const palette = Object.fromEntries(COMFORT_CLASSES.map((cls) => [cls, colourRgb(COMFORT_SWATCH[cls])])) as Record<
    ComfortClass,
    { r: number; g: number; b: number }
  >;
  for (let py = 0; py < height; py++) {
    const gy = (py + 0.5) / up - 0.5;
    for (let px = 0; px < width; px++) {
      const gx = (px + 0.5) / up - 0.5;
      const colour =
        palette[
          lawsonClass({
            p4: bilinearSample(p4, cols, rows, gx, gy),
            p6: bilinearSample(p6, cols, rows, gx, gy),
            p8: bilinearSample(p8, cols, rows, gx, gy),
            p10: bilinearSample(p10, cols, rows, gx, gy),
          })
        ];
      const at = (py * width + px) * 4;
      image.data[at] = colour.r;
      image.data[at + 1] = colour.g;
      image.data[at + 2] = colour.b;
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  comfortImages.set(comfort, { revision, canvas });
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

type BaseMapShapes = { roads: Array<{ path: Path2D; width: number }>; water: Path2D; green: Path2D };

function ptsPath(path: Path2D, ring: readonly Pt[], close: boolean) {
  ring.forEach(([e, n], k) => {
    if (k === 0) path.moveTo(e, n);
    else path.lineTo(e, n);
  });
  if (close) path.closePath();
}

function baseMapShapes(model: CityModel): BaseMapShapes {
  const water = new Path2D();
  const green = new Path2D();
  for (const area of model.areas) {
    if (area.kind === "block" || area.ring.length < 3) continue;
    const target = area.kind === "water" ? water : green;
    ptsPath(target, area.ring, true);
    for (const hole of area.holes) if (hole.length >= 3) ptsPath(target, hole, true);
  }
  const roads: BaseMapShapes["roads"] = [];
  for (const road of model.roads) {
    if (road.kind !== "road" || road.line.length < 2 || !(road.width > 0)) continue;
    const path = new Path2D();
    ptsPath(path, road.line, false);
    roads.push({ path, width: road.width });
  }
  return { roads, water, green };
}

function drawBaseMap(ctx: CanvasRenderingContext2D, shapes: BaseMapShapes) {
  ctx.fillStyle = getColour("--wind-plan-green");
  ctx.fill(shapes.green, "evenodd");
  ctx.fillStyle = getColour("--wind-plan-water");
  ctx.fill(shapes.water, "evenodd");
  ctx.strokeStyle = getColour("--wind-plan-road");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const road of shapes.roads) {
    ctx.lineWidth = road.width;
    ctx.stroke(road.path);
  }
}

function strokeSiteBoundary(ctx: CanvasRenderingContext2D, path: Path2D, scale: number) {
  const pen = readDrawingStyle().siteBoundary;
  const segments = dashSegments(pen.dash);
  ctx.strokeStyle = getColour("--site-boundary");
  ctx.lineWidth = Math.max(1, screenPx(pen.mm)) / scale;
  ctx.lineJoin = "round";
  ctx.lineCap = segments?.some((segment, index) => segment === 0 && index % 2 === 0) ? "round" : "butt";
  ctx.setLineDash(segments ? segments.map((mm) => screenDashPx(mm) / scale) : []);
  ctx.stroke(path);
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
  const buildings = useMemo(() => buildingShapes(model), [model]);
  const cut = useMemo(() => cutExtent(model), [model]);
  const site = useMemo(() => {
    const clip = windPlanSiteClip(model);
    return { ...clip, path: ringsPath(clip.rings) };
  }, [model]);
  const baseMap = useMemo(() => baseMapShapes(model), [model]);
  const { mode, speed, comfort } = plan;

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
    if (!data) return;
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
      ctx.fillStyle = getColour("--wind-plan-water");
      ctx.fill(baseMap.water, "evenodd");
    } else if (mode === "comfort" && comfort) {
      ctx.fillStyle = getColour("--wind-plan-basemap");
      ctx.fillRect(cut.minE, cut.minN, cut.maxE - cut.minE, cut.maxN - cut.minN);
      drawBaseMap(ctx, baseMap);
      ctx.save();
      ctx.clip(site.path, "evenodd");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(comfortImage(comfort, colourRevision), originE, originN, gridW, gridH);
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = getColour("--wind-plan-water");
      ctx.fill(baseMap.water, "evenodd");
      const unsafe = windPlanUnsafeRings(comfort);
      if (unsafe.length > 0) {
        const path = cachedPath(unsafe, () => unsafe);
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
        if (!pointInClip(e, n, site.rings)) continue;
        const disc = new Path2D();
        disc.arc(e, n, radius, 0, Math.PI * 2);
        ctx.save();
        ctx.clip(disc);
        hatch(ctx, rect.width, rect.height, style, dpr);
        ctx.restore();
        strokePen(ctx, disc, style.unsafeOutline, scale);
      }
      ctx.restore();
    }

    ctx.fillStyle = getColour(mode === "comfort" ? "--wind-plan-comfort-building" : "--wind-plan-building");
    ctx.fill(buildings.path, "nonzero");
    strokeInside(ctx, buildings.path, style.buildingEdge, scale);
    ctx.restore();
    if (mode === "comfort") {
      ctx.save();
      worldTransform();
      strokeSiteBoundary(ctx, site.path, scale);
      ctx.restore();
    }
  }, [store, mode, speed, comfort, buildings, cut, site, baseMap, colourRevision]);

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
    return () => {
      unsubscribe();
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [store, schedule]);

  return (
    <div ref={hostRef} className="wind-plan-overlay" aria-hidden="true" data-wind-plan-mode={mode}>
      <canvas ref={canvasRef} className="wind-plan-canvas" />
    </div>
  );
}
