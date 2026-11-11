import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { rasterizeSunHoursGroundGridFor3d } from "../lib/sunHoursGroundRaster";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import type { CityModel } from "../types";

export function SunHoursLayer({
  grid,
  overlay,
  scaleMaxHours,
  model,
  groundY,
}: {
  grid: SunHoursGroundGrid;
  overlay: SunHoursDirectOverlay | null;
  scaleMaxHours: number;
  model: CityModel;
  groundY: number;
}) {
  const texture = useMemo(() => {
    const scaledGrid = { ...grid, maxSunHours: scaleMaxHours };
    const canvas = rasterizeSunHoursGroundGridFor3d(scaledGrid);
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [grid, scaleMaxHours]);
  useEffect(() => () => texture?.dispose(), [texture]);

  const surfaceGeometry = useMemo(() => {
    if (!overlay || overlay.cellCount === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(overlay.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(overlay.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [overlay]);

  useEffect(() => () => surfaceGeometry?.dispose(), [surfaceGeometry]);

  return (
    <>
      {texture ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + 0.12, 0]} renderOrder={900} data-sun-hours-direct-ground>
          <planeGeometry args={[model.sideM, model.sideM]} />
          <meshBasicMaterial map={texture} transparent={false} depthWrite={false} depthTest={false} toneMapped={false} />
        </mesh>
      ) : null}
      {surfaceGeometry ? (
        <mesh geometry={surfaceGeometry} renderOrder={1100} data-sun-hours-direct-surfaces>
          <meshBasicMaterial vertexColors toneMapped={false} depthTest depthWrite side={THREE.FrontSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ) : null}
    </>
  );
}
