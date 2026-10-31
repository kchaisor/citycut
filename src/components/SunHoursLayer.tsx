import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { sunHoursColour, sunHoursGrid } from "../lib/sunHours";
import type { CityModel } from "../types";

export function SunHoursLayer({
  model,
  year,
  month,
  day,
  groundY,
}: {
  model: CityModel;
  year: number;
  month: number;
  day: number;
  groundY: number;
}) {
  const texture = useMemo(() => {
    const grid = sunHoursGrid(model, { year, month, day });
    if (!grid) return null;
    const canvas = document.createElement("canvas");
    canvas.width = grid.res;
    canvas.height = grid.res;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(grid.res, grid.res);
    for (let i = 0; i < grid.hours.length; i++) image.data.set(sunHoursColour(grid.hours[i]!, grid.maxHours), i * 4);
    ctx.putImageData(image, 0, 0);
    document.documentElement.dataset.sunHoursMs = String(Math.round(grid.ms));
    document.documentElement.dataset.sunHoursSteps = `${grid.steps}+${grid.skipped} skipped`;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [model, year, month, day]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.15, 0]} renderOrder={900}>
      <planeGeometry args={[model.sideM, model.sideM]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  );
}
