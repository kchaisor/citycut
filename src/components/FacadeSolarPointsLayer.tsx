import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { facadeOverlayPoints } from "../lib/facadeSolarAssess";
import { getColour } from "../lib/colours";
import { planToWorld, type FacadeAssessBundle } from "../lib/facadeSolarTypes";

export function facadeOverlayGeometry(bundle: FacadeAssessBundle): THREE.BufferGeometry {
  const overlay = facadeOverlayPoints(bundle);
  const positions = new Float32Array(overlay.length * 3);
  const colors = new Float32Array(overlay.length * 3);
  const fillColours = new Map<string, THREE.Color>();
  overlay.forEach((point, index) => {
    let colour = fillColours.get(point.fill);
    if (!colour) {
      colour = new THREE.Color(getColour(point.fill));
      fillColours.set(point.fill, colour);
    }
    positions.set(planToWorld(point.east, point.north, point.yM), index * 3);
    colors.set([colour.r, colour.g, colour.b], index * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function FacadeSolarPointsLayer({ bundle }: { bundle: FacadeAssessBundle }) {
  const geometry = useMemo(() => facadeOverlayGeometry(bundle), [bundle]);
  const pointCount = geometry.attributes.position!.count;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.facadeSolarAssessMs = String(Math.round(bundle.assessMs));
    return () => {
      geometry.dispose();
      delete root.dataset.facadeSolarOverlay;
    };
  }, [bundle.assessMs, geometry]);

  if (pointCount === 0) return null;

  return (
    <points
      geometry={geometry}
      renderOrder={1200}
      onBeforeRender={() => {
        document.documentElement.dataset.facadeSolarOverlay = String(pointCount);
      }}
    >
      <pointsMaterial size={5.5} sizeAttenuation vertexColors depthTest depthWrite={false} toneMapped={false} />
    </points>
  );
}
