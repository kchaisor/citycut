import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ProjectionMode } from "../lib/viewMemory";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import {
  studioCameraHeadingDeg,
  studioCompassNeedleDeg,
} from "../lib/studioCompass";
import {
  STUDIO_COMPASS_FACE_NORTH_EVENT,
  beginCompassNorthAnim,
  setStudioCameraHeadingWithOrbit,
  syncOrbitControlsFromCamera,
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
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const animRef = useRef<CompassNorthAnim | null>(null);
  const controlsEnabledRef = useRef(true);

  const activePair = () => {
    const orthoView = projection === "iso" || projection === "plan";
    const controls = orthoView ? orthoControls.current : perspControls.current;
    const camera = orthoView ? ortho : persp;
    return { controls, camera };
  };

  const frameloopDemand = () =>
    typeof window !== "undefined" && window.__citycutPerfOverrides?.frameloopAlways === true
      ? "always"
      : "demand";

  const endAnim = (anim: CompassNorthAnim) => {
    syncOrbitControlsFromCamera(anim.controls);
    anim.controls.enabled = controlsEnabledRef.current;
    animRef.current = null;
    set({ frameloop: frameloopDemand() });
    invalidate();
  };

  useEffect(() => {
    const onFaceNorth = () => {
      const { controls, camera } = activePair();
      if (!controls) return;
      if (Math.abs(studioCameraHeadingDeg(camera)) < 0.5) return;
      if (animRef.current) endAnim(animRef.current);
      controlsEnabledRef.current = controls.enabled;
      controls.enabled = false;
      animRef.current = beginCompassNorthAnim(controls, camera);
      set({ frameloop: "always" });
      invalidate();
    };
    window.addEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
    return () => window.removeEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
  }, [invalidate, ortho, orthoControls, persp, perspControls, projection, set]);

  useEffect(() => {
    if (!qaModeFromSearch(typeof window === "undefined" ? "" : window.location.search)) return;
    window.__citycutCompassQa = {
      getCameraHeadingDeg: () => {
        const { camera } = activePair();
        return studioCameraHeadingDeg(camera);
      },
      getNeedleDeg: () => {
        const { camera } = activePair();
        return studioCompassNeedleDeg(studioCameraHeadingDeg(camera));
      },
      setCameraHeadingDeg: (deg: number) => {
        const { controls, camera } = activePair();
        if (!controls) return;
        setStudioCameraHeadingWithOrbit(controls, camera, deg);
        syncOrbitControlsFromCamera(controls);
        invalidate();
      },
    };
    return () => {
      delete window.__citycutCompassQa;
    };
  }, [invalidate, ortho, orthoControls, persp, perspControls, projection]);

  useFrame((_, delta) => {
    const anim = animRef.current;
    if (!anim) return;
    const done = tickCompassNorthAnim(anim, delta * 1000);
    invalidate();
    if (done) endAnim(anim);
  });

  return null;
}