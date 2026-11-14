import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { ProjectionMode } from "../lib/viewMemory";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import {
  studioCameraHeadingDeg,
  studioCompassNeedleDeg,
} from "../lib/studioCompass";
import {
  STUDIO_COMPASS_FACE_NORTH_EVENT,
  STUDIO_COMPASS_RESET_MS,
  beginCompassNorthAnim,
  clearOrbitControlInertia,
  setCompassNorthTweenActive,
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
  touchedRef,
}: {
  projection: ProjectionMode;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  perspControls: RefObject<OrbitControlsImpl | null>;
  orthoControls: RefObject<OrbitControlsImpl | null>;
  touchedRef: RefObject<boolean>;
}) {
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const animRef = useRef<CompassNorthAnim | null>(null);
  const controlsGateRef = useRef({
    enabled: true,
    enableRotate: true,
    enablePan: true,
    enableZoom: true,
    enableDamping: true,
  });

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
    const gate = controlsGateRef.current;
    anim.controls.enabled = gate.enabled;
    anim.controls.enableRotate = gate.enableRotate;
    anim.controls.enablePan = gate.enablePan;
    anim.controls.enableZoom = gate.enableZoom;
    anim.controls.enableDamping = gate.enableDamping;
    setCompassNorthTweenActive(false);
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
      touchedRef.current = true;
      setCompassNorthTweenActive(true);
      controlsGateRef.current = {
        enabled: controls.enabled,
        enableRotate: controls.enableRotate,
        enablePan: controls.enablePan,
        enableZoom: controls.enableZoom,
        enableDamping: controls.enableDamping,
      };
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableDamping = false;
      clearOrbitControlInertia(controls);
      const anim = beginCompassNorthAnim(controls, camera);
      animRef.current = anim;
      set({ frameloop: "always" });
      const startMs = performance.now();
      while (performance.now() - startMs < STUDIO_COMPASS_RESET_MS) {
        const elapsed = performance.now() - startMs;
        tickCompassNorthAnim(anim, elapsed);
        invalidate();
      }
      tickCompassNorthAnim(anim, STUDIO_COMPASS_RESET_MS);
      invalidate();
      endAnim(anim);
    };
    window.addEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
    return () => {
      window.removeEventListener(STUDIO_COMPASS_FACE_NORTH_EVENT, onFaceNorth);
      setCompassNorthTweenActive(false);
    };
  }, [invalidate, ortho, orthoControls, persp, perspControls, projection, set, touchedRef]);

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

  return null;
}