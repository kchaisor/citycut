import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildSunHoursGroundDrapeGeometry } from "../lib/sunHoursGroundDrape";
import { rasterizeSunHoursGroundGridFor3d } from "../lib/sunHoursGroundRaster";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import type { CityModel } from "../types";

function meshFromBuffers(positions: Float32Array, colors: Float32Array) {
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function SunHoursLayer({
  grid,
  overlay,
  scaleMaxHours,
  model,
  planView,
}: {
  grid: SunHoursGroundGrid;
  overlay: SunHoursDirectOverlay | null;
  scaleMaxHours: number;
  model: CityModel;
  planView: boolean;
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

  const groundGeometry = useMemo(() => buildSunHoursGroundDrapeGeometry(grid, model), [grid, model]);

  useEffect(() => () => groundGeometry.dispose(), [groundGeometry]);

  const roofGeometry = useMemo(
    () => (overlay ? meshFromBuffers(overlay.roofPositions, overlay.roofColors) : null),
    [overlay],
  );
  const wallGeometry = useMemo(
    () => (!planView && overlay ? meshFromBuffers(overlay.wallPositions, overlay.wallColors) : null),
    [overlay, planView],
  );

  useEffect(() => () => roofGeometry?.dispose(), [roofGeometry]);
  useEffect(() => () => wallGeometry?.dispose(), [wallGeometry]);

  return (
    <>
      {texture ? (
        <mesh geometry={groundGeometry} renderOrder={900} data-sun-hours-direct-ground>
          <meshBasicMaterial
            map={texture}
            transparent
            alphaTest={0.04}
            depthTest
            depthWrite={false}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ) : null}
      {roofGeometry ? (
        <mesh geometry={roofGeometry} renderOrder={1500} data-sun-hours-direct-roofs>
          <meshBasicMaterial
            vertexColors
            toneMapped={false}
            depthTest
            depthWrite={false}
            side={THREE.FrontSide}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ) : null}
      {wallGeometry ? (
        <mesh geometry={wallGeometry} renderOrder={1500} data-sun-hours-direct-walls>
          <meshBasicMaterial
            vertexColors
            toneMapped={false}
            depthTest
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ) : null}
    </>
  );
}
