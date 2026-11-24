import * as THREE from "three";
import { useEffect, useState, useSyncExternalStore } from "react";
import { buildArrowShape, buildStreakRibbons, type ArrowMotion, type ArrowRibbon, type ArrowShape, type DiagramArrow } from "./diagramArrows";
import { systemPrefersReducedMotion } from "./windStreakMotion";

export const DRAW_ON_GROW_S = 1.6;
export const DRAW_ON_HOLD_S = 0.8;
export const DRAW_ON_LOOP_S = DRAW_ON_GROW_S + DRAW_ON_HOLD_S;
export const DASH_PERIOD_S = 0.9;
const STREAK_LIGHTEN = 0.55;

declare global {
  interface Window {
    __citycutDiagramArrowsAnim?: { readonly animated: number; readonly t: number };
  }
}

export function drawOnProgress(seconds: number): number {
  const phase = ((seconds % DRAW_ON_LOOP_S) + DRAW_ON_LOOP_S) % DRAW_ON_LOOP_S;
  return Math.min(1, phase / DRAW_ON_GROW_S);
}

export function dashPhase(seconds: number): number {
  return (((seconds / DASH_PERIOD_S) % 1) + 1) % 1;
}

export function arrowMotionAt(animation: DiagramArrow["animation"], seconds: number): ArrowMotion | null {
  if (animation === "draw-on") return { kind: "draw-on", progress: drawOnProgress(seconds) };
  if (animation === "dashes") return { kind: "dashes", phase: dashPhase(seconds) };
  return null;
}

export function animatedArrowShape(
  arrow: Pick<DiagramArrow, "points" | "style" | "width" | "animation">,
  sideM: number,
  floorMPerPx: number,
  seconds: number | null,
): { body: ArrowShape; streaks: ArrowRibbon[] } {
  const live = seconds !== null;
  return {
    body: buildArrowShape(arrow.points, arrow.style, arrow.width, sideM, floorMPerPx, live ? arrowMotionAt(arrow.animation, seconds) : null),
    streaks: live && arrow.animation === "streaks" ? buildStreakRibbons(arrow.points, arrow.style, arrow.width, sideM, floorMPerPx, seconds) : [],
  };
}

export function animatedArrows<T extends Pick<DiagramArrow, "animation">>(arrows: readonly T[], reducedMotion: boolean): T[] {
  return reducedMotion ? [] : arrows.filter((arrow) => arrow.animation !== "none");
}

let clockSource: () => number = () => performance.now() / 1000;
let clockOrigin: number | null = null;

export function setArrowClockSource(source: (() => number) | null): void {
  clockSource = source ?? (() => performance.now() / 1000);
  clockOrigin = null;
}

export function arrowClockSeconds(): number {
  const now = clockSource();
  if (clockOrigin === null) clockOrigin = now;
  return now - clockOrigin;
}

export function lightenArrowColour(css: string): THREE.Color {
  return new THREE.Color(css).lerp(new THREE.Color(1, 1, 1), STREAK_LIGHTEN);
}

export function useArrowReducedMotion(): boolean {
  const [reduced, setReduced] = useState(systemPrefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function publishArrowAnimation(animated: number): () => void {
  window.__citycutDiagramArrowsAnim = {
    animated,
    get t() {
      return arrowClockSeconds();
    },
  };
  return () => {
    delete window.__citycutDiagramArrowsAnim;
  };
}

const tickListeners = new Set<() => void>();
let tickFrame = 0;
let tickVersion = 0;

function tick(): void {
  tickVersion += 1;
  for (const listener of tickListeners) listener();
  tickFrame = tickListeners.size > 0 ? requestAnimationFrame(tick) : 0;
}

function subscribeTicker(listener: () => void): () => void {
  tickListeners.add(listener);
  if (tickFrame === 0) tickFrame = requestAnimationFrame(tick);
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickFrame !== 0) {
      cancelAnimationFrame(tickFrame);
      tickFrame = 0;
    }
  };
}

const idleSubscribe = () => () => {};

export function arrowTickerListeners(): number {
  return tickListeners.size;
}

export function useArrowTicker(active: boolean): number {
  return useSyncExternalStore(active ? subscribeTicker : idleSubscribe, () => tickVersion, () => 0);
}
