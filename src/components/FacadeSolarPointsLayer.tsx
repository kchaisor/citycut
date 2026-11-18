import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildFacadeWallOverlayMesh, facadeOverlayPoints } from "../lib/facadeSolarAssess";
import type { FacadeAssessBundle } from "../lib/facadeSolarTypes";

export function facadeOverlayGeometry(bundle: FacadeAssessBundle): THREE.BufferGeometry {
  const { positions, colors } = buildFacadeWallOverlayMesh(bundle);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function FacadeSolarPointsLayer({ bundle }: { bundle: FacadeAssessBundle }) {
  const { geometry, cellCount } = useMemo(() => {
    const wallPoints = facadeOverlayPoints(bundle).filter((point) => point.kind === "facade-bay");
    const cellCount = wallPoints.length;
    const { positions, colors } = buildFacadeWallOverlayMesh(bundle);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, cellCount };
  }, [bundle]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.facadeSolarAssessMs = String(Math.round(bundle.assessMs));
    return () => {
      geometry.dispose();
      delete root.dataset.facadeSolarOverlay;
    };
  }, [bundle.assessMs, geometry]);

  if (cellCount === 0) return null;

  return (
    <mesh
      geometry={geometry}
      renderOrder={1200}
      data-facade-solar-overlay=""
      onBeforeRender={() => {
        document.documentElement.dataset.facadeSolarOverlay = String(cellCount);
      }}
    >
      <meshBasicMaterial
        vertexColors
        depthTest
        depthWrite={false}
        toneMapped={false}
        side={THREE.FrontSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}
