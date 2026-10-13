import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { mgaGridCrosses, mgaGridStep } from "../lib/mgaGrid";

/**
 * Map grid on the landing map: small + crosses at MGA easting/northing intersections
 * (GDA2020 / MGA, zone of the view centre; EPSG:7855 in Melbourne). Drawn on a canvas over the
 * map with pointer-events off, redrawn on move. It only reads the camera, never sets it.
 */
export function MgaGridOverlay({ map }: { map: maplibregl.Map | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!map || !canvas || typeof map.getBounds !== "function" || typeof map.project !== "function" || typeof map.getContainer !== "function") return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const container = map.getContainer();
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const b = map.getBounds();
      const centre = map.getCenter();
      const metresPerPixel = 40075016.686 * Math.cos((centre.lat * Math.PI) / 180) / (512 * 2 ** map.getZoom());
      const step = mgaGridStep(metresPerPixel);
      const crosses = mgaGridCrosses({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, step);
      const style = getComputedStyle(canvas);
      const ink = style.getPropertyValue("--grid-cross").trim() || style.color;
      const arm = Number.parseFloat(style.getPropertyValue("--grid-cross-arm")) || 6;
      // Keep the controls' strip clear: no crosses under the floating sidebar (camera padding).
      const clearLeft = typeof map.getPadding === "function" ? (map.getPadding().left ?? 0) : 0;
      const path = new Path2D();
      for (const cross of crosses) {
        const p = map.project([cross.lon, cross.lat]);
        const x = Math.round(p.x) + 0.5;
        const y = Math.round(p.y) + 0.5;
        if (x < clearLeft + arm || y < -arm || x > width + arm || y > height + arm) continue;
        path.moveTo(x - arm, y);
        path.lineTo(x + arm, y);
        path.moveTo(x, y - arm);
        path.lineTo(x, y + arm);
      }
      // Only the thin dark cross: no outline or halo.
      ctx.lineCap = "butt";
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.stroke(path);
      canvas.dataset.crosses = String(crosses.length);
      canvas.dataset.step = String(step);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("resize", schedule);
    };
  }, [map]);
  return <canvas ref={canvasRef} className="map-grid" aria-hidden="true" />;
}
