import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { CityModel } from "../types";
import { visibleIn3d, type DiagramArrow } from "../lib/diagramArrows";
import { drawPlanArrows, registerStaticPlanArrows } from "../lib/diagramArrowsPlanDraw";
import { animatedArrows, arrowClockSeconds, publishArrowAnimation, useArrowMotionStopped, useArrowTicker } from "../lib/diagramArrowsMotion";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPlanTransformStore } from "./WindPlanOverlay";

const NO_ANIMATION: ReadonlySet<DiagramArrow> = new Set();

export function DiagramArrowsPlanOverlay({
  model,
  arrows,
  store,
}: {
  model: CityModel;
  arrows: readonly DiagramArrow[];
  store: WindPlanTransformStore;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colourRevision = useColourRevision();
  const reducedMotion = useArrowMotionStopped();
  const shown = useMemo(() => visibleIn3d(arrows), [arrows]);
  const animated = useMemo(() => new Set(animatedArrows(shown, reducedMotion)), [shown, reducedMotion]);
  const tick = useArrowTicker(animated.size > 0);

  useEffect(() => {
    if (animated.size === 0) return;
    return publishArrowAnimation(animated.size);
  }, [animated.size]);

  const paint = useCallback(
    (canvas: HTMLCanvasElement, live: ReadonlySet<DiagramArrow>): void => {
      const host = hostRef.current;
      const t = store.get();
      if (!host || !t) return;
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawPlanArrows(ctx, shown, { ...t, ox: t.ox - rect.left, oy: t.oy - rect.top }, dpr, model.sideM, live, arrowClockSeconds());
    },
    [store, shown, model.sideM, colourRevision],
  );

  const draw = useCallback(() => {
    if (canvasRef.current) paint(canvasRef.current, animated);
  }, [paint, animated]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return registerStaticPlanArrows(canvas, (target) => paint(target, NO_ANIMATION));
  }, [paint]);

  useLayoutEffect(() => {
    draw();
  }, [draw, tick]);

  useEffect(() => {
    const unsubscribe = store.subscribe(draw);
    const host = hostRef.current;
    const observer = typeof ResizeObserver !== "undefined" && host ? new ResizeObserver(draw) : null;
    if (observer && host) observer.observe(host);
    return () => {
      unsubscribe();
      observer?.disconnect();
    };
  }, [store, draw]);

  return (
    <div ref={hostRef} className="wind-plan-overlay diagram-arrows-plan" aria-hidden="true" data-plan-arrows={shown.length}>
      <canvas ref={canvasRef} className="wind-plan-canvas" />
    </div>
  );
}
