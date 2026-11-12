import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildSunHoursGroundDrapeGeometry } from "../lib/sunHoursGroundDrape";
import { rasterizeSunHoursGroundGridFor3d } from "../lib/sunHoursGroundRaster";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import type { CityModel } from "../types";

const SUN_HOURS_ROOF_RENDER_ORDER = 1600;

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
  groundOnly = false,
  surfacesOnly = false,
}: {
  grid: SunHoursGroundGrid;
  overlay: SunHoursDirectOverlay | null;
  scaleMaxHours: number;
  model: CityModel;
  planView: boolean;
  groundOnly?: boolean;
  surfacesOnly?: boolean;
}) {
  const showGround = !surfacesOnly;
  const showSurfaces = !groundOnly;

  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  useEffect(() => {
    if (typeof document === "undefined" || !showSurfaces) return;
    const next = overlayRef.current;
    const roofOn = Boolean(next && next.roofPositions.length > 0);
    const wallsOn = Boolean(!planView && next && next.wallPositions.length > 0);
    document.documentElement.dataset.sunHoursDirectPlanView = planView ? "1" : "0";
    document.documentElement.dataset.sunHoursDirectRoofsVisible = roofOn ? "1" : "0";
    document.documentElement.dataset.sunHoursDirectWallsVisible = wallsOn ? "1" : "0";
    return () => {
      delete document.documentElement.dataset.sunHoursDirectPlanView;
      delete document.documentElement.dataset.sunHoursDirectRoofsVisible;
      delete document.documentElement.dataset.sunHoursDirectWallsVisible;
    };
  }, [overlay, planView, showSurfaces]);

  const texture = useMemo(() => {
    if (!showGround) return null;
    const scaledGrid = { ...grid, maxSunHours: scaleMaxHours };
    const canvas = rasterizeSunHoursGroundGridFor3d(scaledGrid);
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [grid, scaleMaxHours, showGround]);
  useEffect(() => () => texture?.dispose(), [texture]);

  const groundGeometry = useMemo(
    () => (showGround ? buildSunHoursGroundDrapeGeometry(grid, model) : null),
    [grid, model, showGround],
  );

  useEffect(() => () => groundGeometry?.dispose(), [groundGeometry]);

  const roofGeometry = useMemo(
    () => (showSurfaces && overlay ? meshFromBuffers(overlay.roofPositions, overlay.roofColors) : null),
    [overlay, showSurfaces],
  );
  const wallGeometry = useMemo(
    () => (showSurfaces && !planView && overlay ? meshFromBuffers(overlay.wallPositions, overlay.wallColors) : null),
    [overlay, planView, showSurfaces],
  );

  useEffect(() => () => roofGeometry?.dispose(), [roofGeometry]);
  useEffect(() => () => wallGeometry?.dispose(), [wallGeometry]);

  return (
  <>
      {texture && groundGeometry ? (
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
        <mesh geometry={roofGeometry} renderOrder={SUN_HOURS_ROOF_RENDER_ORDER} data-sun-hours-direct-roofs>
          <meshBasicMaterial
            vertexColors
            toneMapped={false}
            depthTest
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
          />
        </mesh>
      ) : null}
      {wallGeometry ? (
        <mesh geometry={wallGeometry} renderOrder={SUN_HOURS_ROOF_RENDER_ORDER} data-sun-hours-direct-walls>
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
