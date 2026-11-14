import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ProjectionMode } from "../lib/viewMemory";
import { studioCameraHeadingDeg } from "../lib/studioCompass";
import {
  STUDIO_COMPASS_FACE_NORTH_EVENT,
  beginCompassNorthAnim,
  tickCompassNorthAnim,
  type CompassNorthAnim,
} from "../lib/studioCompassNorth";

export function StudioCompassNorthBridge({
  projection,
  persp,
  ortho,
  perspControls,
  orthoControls,
}: {
  projection: ProjectionMode;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  perspControls: RefObject<OrbitControlsImpl | null>;
  orthoControls: RefObject<OrbitControlsImpl | null>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const animRef = useRef<CompassNorthAnim | null>(null);

  useEffect(() => {
    const onFaceNorth = () => {
      const orthoView = projection === "iso" || projection === "plan";
      const controls = orthoView ? orthoControls.current : perspControls.current;
      const camera = orthoView ? ortho : persp;
      if (!controls) return;
      if (Math.abs(studioCameraHeadingDeg(camera)) < 0.5) return;
      animRef.current = beginCompassNorthAnim(controls, camera);
      invalidate();
    };
    window.addEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
    return () => window.removeEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
  }, [invalidate, ortho, orthoControls, persp, perspControls, projection]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    const done = tickCompassNorthAnim(anim, delta * 1000);
    invalidate();
    if (done) animRef.current = null;
  });

  return null;
}