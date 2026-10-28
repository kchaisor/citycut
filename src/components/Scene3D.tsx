import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import * as THREE from "three";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { addBuildingEdges } from "../lib/buildingEdges";
import { attachScenePointPick, attachBuildingPick } from "../lib/buildingPick";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
import { basePlinthBottomY } from "../lib/terrain";
import { auditBuildingSelection, mountSelectedBuildingsVisual } from "../lib/buildingSelectionVisual";
import { CAMERA_FIT_INCLUDES_HELIODON } from "../lib/sceneCameraFit";
import { shotFromCamera, type CameraShot } from "../lib/cameraShot";
import { getColour } from "../lib/colours";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import { captureViewPng } from "../lib/capturePng";
import { GradientSky, GroundGrid, ViewInset, insetPointerEvents } from "./SceneBackdrop";
import { markScreenOnly } from "../lib/screenOnly";
import { cameraForExportFrame, exportFrameSize } from "../lib/exportFrame";
import { flushControlInertia, holdControlPose, type HeldControl } from "../lib/controlInertia";
import { shouldSkipViewportSizeRefit } from "../lib/viewportAutoFit";
import {
  applyPose,
  capturePose,
  usableCameraMemory,
  type CameraMemory,
  type CameraMemoryRef,
} from "../lib/cameraMemory";
import {
  applyBuildingSolarNeutral,
  snapshotBuildingViewportColors,
  withBuildingExportColours,
  type BuildingColourMode,
} from "../lib/buildingViewportColor";
import {
  applySunStudySurfaceTint,
  refreshSceneSurfaceColors,
  snapshotSunStudySurfaceColors,
} from "../lib/sunStudySurfaceViewport";
import {
  eyeDistance,
  fitOrthoZoom,
  frameCentre,
  ISO_CAMERA_UP,
  isoEye,
  isoOffset,
  orthoNearFar,
  type Aabb,
  type IsoCorner,
  type Vec3,
} from "../lib/isoCamera";
import {
  fitPlanOrthoZoom,
  planEye,
  planEyeDistance,
  planNearFar,
  sitePlanBounds,
} from "../lib/planCamera";
import { qaModeFromSearch, registerQaCameraBridge, type QaCameraPose } from "../lib/qaCameraBridge";
import { WebGlContextWatch } from "./WebGlContextWatch";
import type { ProjectionMode } from "../lib/viewMemory";
import { isLayer3dVisible, treesVisibleIn3d, type View3dDisplaySettings } from "../lib/view3dDisplay";
import { buildContourLineObject } from "../lib/contourLines3d";
import {
  applyWhiteCardTint,
  snapshotWhiteCardColors,
  whiteCardViewportLighting,
} from "../lib/whiteCardViewport";
import {
  DEFAULT_PERSPECTIVE_OFFSET,
  heliodonSceneBounds,
  perspectiveFitDistance,
  unionAabb,
} from "../lib/heliodonFraming";
import {
  computePerspectiveViewportPose,
  perspectiveClipFar,
} from "../lib/perspectiveViewportFit";
import { heliodonRadiusM } from "../lib/heliodonRadius";
import { sunStudyViewportLighting } from "../lib/sunStudyViewport";
import { SunHoursLayer } from "./SunHoursLayer";

/** Hours-of-sun heatmap: later phase. Code kept, no UI; flip to preview. */
const SUN_HOURS_HEATMAP_ENABLED = false;
import { SolarHeliodon, SolarLight, useMelbourneSunSample, type SolarViewSettings } from "./SolarHeliodon";
import { WindStaticArrows, WindStreaks } from "./WindStreaks";
import { analyzeWindPeriod, type WindPeriodId, type WindRoseTable } from "../lib/windRose";
import type { CityModel } from "../types";

export type SceneExporter = {
  png: () => Promise<Blob>;
  shot: () => CameraShot;
};

type FiberCamera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean };

export const INTRO_TRANSITION_MS = 2100;
const INTRO_TRANSITION_SEC = INTRO_TRANSITION_MS / 1000;
const INTRO_HOLD_RELEASE_SEC = INTRO_TRANSITION_SEC;

export function shouldRunIntroTransition(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/jsdom|HappyDOM/i.test(ua)) return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  if (qaModeFromSearch(window.location.search)) return false;
  return true;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export function computeIntroBuildingBucketScale(elapsedSec: number, bucket: number): number {
  if (elapsedSec >= INTRO_TRANSITION_SEC) return 1;
  const clampedBucket = Math.max(0, Math.min(23, bucket));
  const bStart = (clampedBucket / 23) * 0.65;
  const u = Math.min(1, Math.max(0, (elapsedSec - bStart) / 1.05));
  return 0.001 + 0.999 * easeInOutCubic(u);
}

export function computeIntroTreeBucketScale(elapsedSec: number, bucket: number): number {
  if (elapsedSec >= INTRO_TRANSITION_SEC) return 1;
  const clampedBucket = Math.max(0, Math.min(15, bucket));
  const tStart = 0.65 + (clampedBucket / 15) * 0.95;
  const rawU = (elapsedSec - tStart) / 0.50;
  if (rawU <= 0) return 0.001;
  if (rawU >= 1) return 1;
  return Math.max(0.001, easeOutCubic(rawU) * (1 + 0.16 * Math.sin(Math.PI * rawU)));
}

function computeIntroTreeWaveScale(elapsedSec: number): number {
  if (elapsedSec >= INTRO_TRANSITION_SEC) return 1;
  let maxScale = 0.001;
  for (let b = 0; b < 16; b++) {
    const s = computeIntroTreeBucketScale(elapsedSec, b);
    if (s > maxScale) maxScale = s;
  }
  return maxScale;
}

const scratch = new THREE.Vector3();

function measureCity(group: THREE.Object3D): Aabb {
  const box = new THREE.Box3().setFromObject(group);
  const instanceBox = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  group.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || mesh.count === 0) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix);
      instanceBox.copy(geometry.boundingBox).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld);
      box.union(instanceBox);
    }
  });
  if (box.isEmpty()) return { min: [-1, 0, -1], max: [1, 1, 1] };
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

function publishCamera(camera: THREE.Camera, target: THREE.Vector3, element: HTMLCanvasElement) {
  scratch.copy(camera.position).sub(target);
  const horizontal = Math.hypot(scratch.x, scratch.z);
  const elevation = THREE.MathUtils.radToDeg(Math.atan2(scratch.y, horizontal));
  const axisAngle = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(scratch.z), Math.abs(scratch.x)));
  let bearing = THREE.MathUtils.radToDeg(Math.atan2(scratch.x, -scratch.z));
  if (bearing < 0) bearing += 360;
  element.dataset.camElevation = elevation.toFixed(3);
  element.dataset.camAxisAngle = axisAngle.toFixed(3);
  element.dataset.camBearing = bearing.toFixed(3);
  // Full pose for QA: proves a resize or sidebar change leaves the camera where it was.
  element.dataset.camPosition = camera.position.toArray().map((v) => v.toFixed(3)).join(",");
  element.dataset.camTarget = target.toArray().map((v) => v.toFixed(3)).join(",");
  element.dataset.camZoom = (camera as THREE.OrthographicCamera | THREE.PerspectiveCamera).zoom.toFixed(4);
  const ortho = camera as THREE.OrthographicCamera;
  element.dataset.camKind = ortho.isOrthographicCamera ? "orthographic" : "perspective";
  if (ortho.isOrthographicCamera) {
    element.dataset.camNear = ortho.near.toFixed(2);
    element.dataset.camFar = ortho.far.toFixed(2);
  } else {
    delete element.dataset.camNear;
    delete element.dataset.camFar;
  }
}

function BuildingPickLayer({
  root,
  enabled,
  onBuildingPick,
  onClearPick,
}: {
  root: THREE.Object3D;
  enabled: boolean;
  onBuildingPick: (buildingId: number, clientX: number, clientY: number, additive?: boolean) => void;
  onClearPick?: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    if (!enabled) return;
    return attachBuildingPick(gl.domElement, camera, root, { onBuildingPick, onClearPick });
  }, [camera, enabled, gl.domElement, onBuildingPick, onClearPick, root]);
  return null;
}

function ScenePointLayer({ onScenePoint }: { onScenePoint: (east: number, north: number, up: number) => void }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useLayoutEffect(
    () =>
      attachScenePointPick(gl.domElement, camera, scene, (point) => onScenePoint(point.x, -point.z, point.y)),
    [camera, gl.domElement, scene, onScenePoint],
  );
  return null;
}

function HeightEditOverlayLayer({
  model,
  buildingIds,
  cityRoot,
  colourMode,
}: {
  model: CityModel;
  buildingIds: readonly number[];
  cityRoot: THREE.Object3D;
  colourMode: BuildingColourMode;
}) {
  const [overlay, setOverlay] = useState<THREE.Group | null>(null);
  useLayoutEffect(() => {
    if (buildingIds.length === 0) {
      setOverlay(null);
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      return;
    }
    const mounted = mountSelectedBuildingsVisual(cityRoot, model, buildingIds, colourMode);
    if (!mounted) {
      setOverlay(null);
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      return;
    }
    setOverlay(mounted.overlay);
    if (typeof window !== "undefined" && qaModeFromSearch(window.location.search)) {
      const publishAudit = () => {
        window.__citycutQaSelectionAudit = auditBuildingSelection(cityRoot, buildingIds, mounted.overlay);
        console.info("[CityCut selection]", window.__citycutQaSelectionAudit);
      };
      publishAudit();
      const frame = window.requestAnimationFrame(publishAudit);
      return () => {
        window.cancelAnimationFrame(frame);
        mounted.restore();
        setOverlay(null);
        delete window.__citycutQaSelectionAudit;
      };
    }
    return () => {
      mounted.restore();
      setOverlay(null);
    };
  }, [buildingIds, cityRoot, colourMode, model]);
  return overlay ? <primitive object={overlay} /> : null;
}

function City({
  model,
  uniformBuildings,
  colourBySource,
  highlightManual,
  solarDiagramOn,
  solarNeutralFill,
  heightEditBuildingId,
  selectedBuildingIds,
  display,
  onBounds,
  onBuildingPick,
  onClearBuildingPick,
  pickBuildings,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  highlightManual: boolean;
  solarDiagramOn: boolean;
  solarNeutralFill: string;
  heightEditBuildingId: number | null;
  selectedBuildingIds?: readonly number[];
  display: View3dDisplaySettings;
  onBounds: (bounds: Aabb) => void;
  onBuildingPick: (buildingId: number, clientX: number, clientY: number, additive?: boolean) => void;
  onClearBuildingPick?: () => void;
  pickBuildings: boolean;
}) {
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const colourTick = useColourRevision();
  const colourMode = useMemo<BuildingColourMode>(
    () => ({
      colourByUse: !uniformBuildings && !colourBySource,
      uniformBuildings,
      colourBySource,
    }),
    [uniformBuildings, colourBySource],
  );
  const group = useMemo(() => {
    const introStagger = shouldRunIntroTransition();
    const city = buildCityGroup(model, { uniformBuildings, colourBySource, highlightManual, introStagger });
    const plinth = city.getObjectByName("BasePlinth");
    const ground = city.getObjectByName("Ground");
    if (plinth && plinth instanceof THREE.Mesh && plinth.userData.plinthEdgePositions instanceof Float32Array) {
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute("position", new THREE.BufferAttribute(plinth.userData.plinthEdgePositions, 3));
      const edges = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({ color: getColour("--ground-edge") }),
      );
      edges.name = "GroundEdge";
      city.add(edges);
    } else if (ground && ground instanceof THREE.Mesh && ground.name === "Ground") {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(ground.geometry),
        new THREE.LineBasicMaterial({ color: getColour("--ground-edge") }),
      );
      edges.position.copy(ground.position);
      edges.name = "GroundEdge";
      city.add(edges);
    }
    addBuildingEdges(city);
    if (introStagger) {
      const ringGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(model.sideM, 1.2, model.sideM));
      const ringMat = new THREE.LineBasicMaterial({
        color: 0xfff500,
        transparent: true,
        opacity: 1,
        depthTest: false,
      });
      const cutRing = new THREE.LineSegments(ringGeo, ringMat);
      cutRing.name = "IntroCutRing";
      const ringBaseY = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
      cutRing.position.y = ringBaseY + 0.6;
      cutRing.raycast = () => {};
      markScreenOnly(cutRing);
      city.add(cutRing);
    }
    return city;
  }, [
    model.center,
    model.sideM,
    model.frameShape,
    model.layers,
    model.buildings,
    model.roads,
    model.tramLines,
    model.areas,
    model.carParks,
    model.trees,
    model.terrain,
    model.contours,
    model.contourLayer,
    model.siteBoundaryLines,
    model.siteBuildingIds,
    model.blocks,
    model.nswRoadSurface,
    uniformBuildings,
    colourBySource,
    highlightManual,
  ]);
  useLayoutEffect(() => {
    onBoundsRef.current(measureCity(group));
  }, [group]);
  const introRef = useRef<{
    cutKey: string;
    elapsedSec: number;
    frameCount: number;
    done: boolean;
    playingStarted?: boolean;
    webglReadyDispatched?: boolean;
    steadyFrames?: number;
    targets: Array<{ obj: THREE.Object3D; pivotY: number; kind: "building" | "tree"; bucket: number }>;
  } | null>(null);
  const cutKey = `${model.center.lat.toFixed(5)},${model.center.lon.toFixed(5)},${model.sideM}`;
  useLayoutEffect(() => {
    const targets: Array<{ obj: THREE.Object3D; pivotY: number; kind: "building" | "tree"; bucket: number }> = [];
    for (const object of group.children) {
      const name = object.name;
      if (name === "Trees") {
        const hasBucketChildren = object.children.some((c) => c.name === "TreesBucket");
        if (hasBucketChildren) {
          for (const sub of object.children) {
            const pivotY = typeof sub.userData.introBaseY === "number" ? sub.userData.introBaseY : 0;
            const bucket = typeof sub.userData.introTreeBucket === "number" ? sub.userData.introTreeBucket : 0;
            targets.push({ obj: sub, pivotY, kind: "tree", bucket });
          }
        } else {
          targets.push({ obj: object, pivotY: 0, kind: "tree", bucket: 0 });
        }
        continue;
      }
      const isExtrudable =
        name === "Buildings" ||
        name === "Buildings-manual" ||
        name === "Buildings-site" ||
        name.startsWith("Buildings::") ||
        name.startsWith("source:") ||
        name === "BuildingEdges" ||
        name === "RoofLines";
      if (!isExtrudable) continue;
      const geom = (object as THREE.Mesh | THREE.LineSegments).geometry as THREE.BufferGeometry | undefined;
      if (geom && !geom.boundingBox) geom.computeBoundingBox();
      const pivotY =
        typeof object.userData.introBaseY === "number"
          ? object.userData.introBaseY
          : geom?.boundingBox
            ? geom.boundingBox.min.y
            : 0;
      const bucket = typeof object.userData.introBuildingBucket === "number" ? object.userData.introBuildingBucket : 0;
      targets.push({ obj: object, pivotY, kind: "building", bucket });
    }
    const cutRingObj = group.getObjectByName("IntroCutRing") as THREE.LineSegments | undefined;
    if (!shouldRunIntroTransition() || targets.length === 0) {
      for (const { obj } of targets) {
        obj.scale.y = 1;
        obj.position.y = 0;
      }
      if (cutRingObj) cutRingObj.visible = false;
      group.userData.introScaleY = 1;
      introRef.current = null;
      return;
    }
    const existing = introRef.current;
    if (existing && existing.cutKey === cutKey) {
      existing.targets = targets;
      if (existing.done) {
        for (const { obj } of targets) {
          obj.scale.y = 1;
          obj.position.y = 0;
        }
        if (cutRingObj) cutRingObj.visible = false;
        group.userData.introScaleY = 1;
      } else {
        if (cutRingObj) {
          const ringOp = Math.max(0, 1 - Math.pow(Math.min(1, existing.elapsedSec / INTRO_TRANSITION_SEC), 2.2));
          cutRingObj.visible = ringOp > 0.005;
          const mat = cutRingObj.material as THREE.LineBasicMaterial;
          if (mat) mat.opacity = ringOp;
        }
        for (const { obj, pivotY, kind, bucket } of targets) {
          const s =
            existing.frameCount < 3 || !existing.playingStarted
              ? 0.001
              : kind === "tree"
                ? computeIntroTreeBucketScale(existing.elapsedSec, bucket)
                : computeIntroBuildingBucketScale(existing.elapsedSec, bucket);
          obj.scale.y = s;
          obj.position.y = pivotY * (1 - s);
        }
        group.userData.introScaleY =
          existing.frameCount < 3 || !existing.playingStarted
            ? 0.001
            : computeIntroBuildingBucketScale(existing.elapsedSec, 0);
      }
      return;
    }
    const startScale = 0.001;
    for (const { obj, pivotY } of targets) {
      obj.scale.y = startScale;
      obj.position.y = pivotY * (1 - startScale);
    }
    group.userData.introScaleY = startScale;
    introRef.current = { cutKey, elapsedSec: 0, frameCount: 0, done: false, webglReadyDispatched: false, targets };
  }, [group, cutKey]);
  useFrame((state, delta) => {
    const intro = introRef.current;
    if (!intro || intro.done) return;
    const ring = group.getObjectByName("IntroCutRing") as THREE.LineSegments | undefined;
    const ds = state.gl.domElement.dataset;
    const canvasExt = state.gl.domElement as HTMLCanvasElement & { __introElapsedSec?: number };
    const bgCol = new THREE.Color(themeColor("--viewport-bg"));
    state.scene.background = null;
    state.gl.setClearColor(bgCol, 0);

    if (intro.frameCount < 3) {
      intro.frameCount += 1;
      const s0 = 0.001;
      for (const { obj, pivotY } of intro.targets) {
        obj.scale.y = s0;
        obj.position.y = pivotY * (1 - s0);
      }
      if (ring) {
        ring.visible = true;
        (ring.material as THREE.LineBasicMaterial).opacity = 1;
      }
      group.userData.introScaleY = s0;
      canvasExt.__introElapsedSec = 0;
      ds.introElapsed = "0.00";
      ds.introProgressPct = "0";
      ds.introUnderlayOpacity = "1.000";
      ds.introScale = s0.toFixed(3);
      ds.introBldgInner = s0.toFixed(3);
      ds.introBldgOuter = s0.toFixed(3);
      ds.introTreeScale = s0.toFixed(3);
      if (intro.frameCount >= 3 && !intro.webglReadyDispatched) {
        intro.webglReadyDispatched = true;
        if (typeof window !== "undefined") {
          window.__citycutWebglPrewarmReady = true;
          const modelRoot = state.gl.domElement.closest(".model");
          if (modelRoot?.hasAttribute("data-intro-webgl-wait")) {
            modelRoot.removeAttribute("data-intro-webgl-wait");
          }
          if (window.__citycutAwaitIntroStart && !window.__citycutIntroStarted) {
            window.__citycutIntroReadyToFire = true;
            window.__citycutIntroStarted = true;
            window.__citycutIntroStartMs = performance.now();
            window.__citycutLoadProgress = 0;
            window.__citycutProgressSamples = [0];
            if (typeof document !== "undefined") {
              const selectEl = document.querySelector(".select") as HTMLElement | null;
              if (selectEl) {
                selectEl.classList.add("is-loading", "is-fading-out");
                selectEl.style.transition = "none";
                selectEl.style.opacity = "1";
                selectEl.dataset.underlayOpacity = "1.000";
              }
            }
            window.dispatchEvent(new CustomEvent("citycut:intro-webgl-ready"));
            window.dispatchEvent(new CustomEvent("citycut:intro-start"));
          } else {
            window.dispatchEvent(new CustomEvent("citycut:intro-webgl-ready"));
          }
        }
      }
      return;
    }

    const introPaused =
      typeof window !== "undefined" &&
      Boolean((window as Window & { __citycutIntroPaused?: boolean }).__citycutIntroPaused);
    if (!intro.playingStarted) {
      intro.playingStarted = true;
      intro.elapsedSec = 0.02;
      if (typeof window !== "undefined" && window.__citycutFirstTiltFrameMs === undefined) {
        window.__citycutFirstTiltFrameMs = performance.now();
      }
    } else if (introPaused) {
      (intro as { wasPaused?: boolean }).wasPaused = true;
    } else if ((intro as { wasPaused?: boolean }).wasPaused) {
      (intro as { wasPaused?: boolean }).wasPaused = false;
      intro.elapsedSec += 0.032;
    } else {
      intro.elapsedSec += Math.min(Math.max(delta, 0.001), 0.14);
    }
    const done = intro.elapsedSec >= INTRO_TRANSITION_SEC;
    const clampedElapsed = done ? INTRO_TRANSITION_SEC : intro.elapsedSec;
    canvasExt.__introElapsedSec = clampedElapsed;
    const progress = done ? 1 : Math.min(1, Math.max(0, clampedElapsed / INTRO_TRANSITION_SEC));
    const pct = done ? 100 : Math.min(100, Math.round(progress * 100));
    const underlayOpacity = done ? 0 : Math.max(0, 1 - progress);

    for (const { obj, pivotY, kind, bucket } of intro.targets) {
      const s = done
        ? 1
        : kind === "tree"
          ? computeIntroTreeBucketScale(clampedElapsed, bucket)
          : computeIntroBuildingBucketScale(clampedElapsed, bucket);
      obj.scale.y = s;
      obj.position.y = done ? 0 : pivotY * (1 - s);
    }
    const bldgInner = done ? 1 : computeIntroBuildingBucketScale(clampedElapsed, 0);
    const bldgOuter = done ? 1 : computeIntroBuildingBucketScale(clampedElapsed, 23);
    const treeScale = done ? 1 : computeIntroTreeWaveScale(clampedElapsed);
    if (ring) {
      const rawT = Math.min(1, clampedElapsed / INTRO_TRANSITION_SEC);
      const ringAlpha = done ? 0 : Math.max(0, 1 - Math.pow(rawT, 2.2));
      ring.visible = ringAlpha > 0.01;
      (ring.material as THREE.LineBasicMaterial).opacity = ringAlpha;
    }
    group.userData.introScaleY = bldgInner;

    if (typeof window !== "undefined") {
      window.__citycutLoadProgress = progress;
      const samples = (window.__citycutProgressSamples ??= [0]);
      if (samples[samples.length - 1] !== pct) {
        samples.push(pct);
      }
      if (typeof document !== "undefined") {
        const pill = document.querySelector(".loading-hud-pill.is-model-bridge") as HTMLElement | null;
        if (pill) {
          pill.dataset.progressPct = String(pct);
          const fill = pill.querySelector(".loading-prog-fill") as HTMLElement | null;
          if (fill) fill.style.width = `${pct}%`;
          const pctText = pill.querySelector(".loading-prog-pct") as HTMLElement | null;
          if (pctText) pctText.textContent = `${pct}%`;
        }
        const selectEl = document.querySelector(".select") as HTMLElement | null;
        if (selectEl) {
          selectEl.classList.add("is-loading", "is-fading-out");
          selectEl.style.transition = "none";
          selectEl.style.opacity = underlayOpacity.toFixed(4);
          selectEl.dataset.underlayOpacity = underlayOpacity.toFixed(3);
        }
      }
    }

    if (clampedElapsed >= INTRO_HOLD_RELEASE_SEC || done) {
      state.scene.background = bgCol;
      state.gl.setClearColor(bgCol, 1);
      const modelRoot = state.gl.domElement.closest(".model");
      if (modelRoot?.hasAttribute("data-intro-hold")) {
        modelRoot.removeAttribute("data-intro-hold");
        modelRoot.dispatchEvent(new CustomEvent("citycut:intro-hold-release"));
      }
    }
    ds.introElapsed = clampedElapsed.toFixed(2);
    ds.introProgressPct = String(pct);
    ds.introUnderlayOpacity = underlayOpacity.toFixed(3);
    ds.introScale = bldgInner.toFixed(3);
    ds.introBldgInner = bldgInner.toFixed(3);
    ds.introBldgOuter = bldgOuter.toFixed(3);
    ds.introTreeScale = treeScale.toFixed(3);
    if (done) {
      intro.done = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("citycut:intro-done"));
      }
    }
  });
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    refreshSceneSurfaceColors(group);
    snapshotBuildingViewportColors(group, colourMode);
    snapshotSunStudySurfaceColors(group);
    snapshotWhiteCardColors(group, colourMode);
    applySunStudySurfaceTint(group, false);
    applyBuildingSolarNeutral(group, false, solarNeutralFill);
    applyWhiteCardTint(group, display.whiteCard);
    invalidate();
  }, [group, colourMode, solarDiagramOn, solarNeutralFill, colourTick, display.whiteCard, invalidate]);
  const buildingsVisible = isLayer3dVisible(display, "buildings");
  const roadsVisible = isLayer3dVisible(display, "roads");
  const footpathsVisible = isLayer3dVisible(display, "footpaths");
  const landscapeVisible = isLayer3dVisible(display, "landscape");
  const waterVisible = isLayer3dVisible(display, "water");
  const railVisible = isLayer3dVisible(display, "rail");
  const contoursVisible = isLayer3dVisible(display, "contours");
  useLayoutEffect(() => {
    group.traverse((object) => {
      const name = object.name;
      if (name === "BuildingEdges") {
        object.visible = display.showOutlines && buildingsVisible;
        return;
      }
      if (
        name === "Buildings" ||
        name === "Buildings-manual" ||
        name === "Buildings-site" ||
        name.startsWith("Buildings::") ||
        name.startsWith("source:")
      ) {
        object.visible = buildingsVisible;
        return;
      }
      if (name === "Roads") {
        const grade = object.userData?.roadGrade;
        object.visible = grade === "path" ? footpathsVisible : roadsVisible;
        return;
      }
      if (name === "Green") {
        object.visible = landscapeVisible;
        return;
      }
      if (name === "Water") {
        object.visible = waterVisible;
        return;
      }
      if (name === "RailLines" || name === "TramLines") {
        object.visible = railVisible;
        return;
      }
      if (name === "GroundEdge") {
        object.visible = display.showOutlines;
      }
    });
  }, [
    group,
    display.showOutlines,
    buildingsVisible,
    roadsVisible,
    footpathsVisible,
    landscapeVisible,
    waterVisible,
    railVisible,
  ]);
  useLayoutEffect(() => {
    const trees = group.getObjectByName("Trees");
    if (trees) trees.visible = treesVisibleIn3d(model.layers, display);
  }, [group, display.hideTrees, display.layersVisible, model.layers]);
  const contours = useMemo(
    () => (contoursVisible ? buildContourLineObject(model) : null),
    [model, contoursVisible],
  );
  useLayoutEffect(() => {
    if (!contours) return;
    const mat = contours.material as THREE.LineDashedMaterial | undefined;
    if (mat?.color) {
      mat.color.setStyle(getColour("--outline-contour"));
      invalidate();
    }
  }, [contours, colourTick, invalidate]);
  useLayoutEffect(() => () => disposeObject(group), [group]);
  return (
    <>
      <primitive object={group} />
      {contours ? <primitive object={contours} /> : null}
      <HeightEditOverlayLayer
        model={model}
        buildingIds={
          buildingsVisible
            ? selectedBuildingIds && selectedBuildingIds.length > 0
              ? selectedBuildingIds
              : heightEditBuildingId != null
                ? [heightEditBuildingId]
                : []
            : []
        }
        cityRoot={group}
        colourMode={colourMode}
      />
      <BuildingPickLayer
        root={group}
        enabled={pickBuildings && buildingsVisible}
        onBuildingPick={onBuildingPick}
        onClearPick={onClearBuildingPick}
      />
    </>
  );
}

/** Sun-study whites read grey under ACES; use linear output while the diagram is on. */
function SunStudyToneMapping({ noToneMapping }: { noToneMapping: boolean }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    gl.toneMapping = noToneMapping ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [gl, noToneMapping]);
  return null;
}

function RendererShadows({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    gl.shadowMap.enabled = enabled;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.needsUpdate = true;
    // Programs compiled before the toggle lack shadow code until they are rebuilt.
    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const item of Array.isArray(material) ? material : material ? [material] : []) item.needsUpdate = true;
    });
  }, [enabled, gl, scene]);
  return null;
}

function BindCamera({ camera }: { camera: THREE.PerspectiveCamera | THREE.OrthographicCamera }) {
  const set = useThree((state) => state.set);
  useLayoutEffect(() => {
    const next = camera as FiberCamera;
    next.manual = true;
    set({ camera: next });
  }, [camera, set]);
  return null;
}

function FrameCameras({
  persp,
  ortho,
}: {
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
}) {
  const size = useThree((state) => state.size);
  useLayoutEffect(() => {
    if (size.width < 2 || size.height < 2) return;
    persp.aspect = size.width / Math.max(size.height, 1);
    persp.updateProjectionMatrix();
    ortho.left = size.width / -2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = size.height / -2;
    ortho.updateProjectionMatrix();
  }, [persp, ortho, size.width, size.height]);
  return null;
}

function PerspectiveFit({
  camera,
  controlsRef,
  side,
  lift,
  groundY,
  siteTopY,
  heliodonRadius,
  solar,
  lat,
  lon,
  fitId,
  active,
  touchedRef,
  fittedKey,
  introEnabled = false,
}: {
  camera: THREE.PerspectiveCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  side: number;
  lift: number;
  groundY: number;
  siteTopY: number;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
  fitId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
  fittedKey: MutableRefObject<string | null>;
  introEnabled?: boolean;
}) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const introAnimRef = useRef<{
    elapsedSec: number;
    frameCount: number;
    done: boolean;
    playingStarted?: boolean;
    target: THREE.Vector3;
    endEye: THREE.Vector3;
    startRadius: number;
    endRadius: number;
    startPhi: number;
    endPhi: number;
    startTheta: number;
    endTheta: number;
  } | null>(null);
  const applyIntroPose = useCallback(
    (
      anim: NonNullable<typeof introAnimRef.current>,
      controls: OrbitControlsImpl,
    ) => {
      const syncedElapsed =
        (gl.domElement as HTMLCanvasElement & { __introElapsedSec?: number }).__introElapsedSec ??
        anim.elapsedSec;
      const rawT =
        anim.frameCount < 3 || !anim.playingStarted
          ? 0
          : Math.min(1, Math.max(0, syncedElapsed / INTRO_TRANSITION_SEC));
      const ease = easeOutCubic(rawT);
      const radius = THREE.MathUtils.lerp(anim.startRadius, anim.endRadius, ease);
      const phi = THREE.MathUtils.lerp(anim.startPhi, anim.endPhi, ease);
      const theta = THREE.MathUtils.lerp(anim.startTheta, anim.endTheta, ease);
      camera.position.setFromSphericalCoords(radius, phi, theta).add(anim.target);
      controls.target.copy(anim.target);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      gl.domElement.dataset.introPolar = phi.toFixed(3);
      gl.domElement.dataset.introRadius = radius.toFixed(1);
    },
    [camera, gl],
  );
  const place = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || !active || size.width < 2 || size.height < 2) return;
    const key = `${fitId}:${size.width}x${size.height}`;
    if (
      shouldSkipViewportSizeRefit(fittedKey.current, key, fitId, touchedRef.current) &&
      fittedKey.current !== null
    ) {
      return;
    }

    const pose = computePerspectiveViewportPose({
      side,
      lift,
      groundY,
      siteTopY,
      heliodonRadius,
      solar,
      lat,
      lon,
      fov: camera.fov,
      aspect: size.width / Math.max(size.height, 1),
    });
    const wasUnfitted = fittedKey.current === null;
    const runningIntro = introAnimRef.current && !introAnimRef.current.done;
    flushControlInertia(controls);
    camera.near = pose.near;
    camera.far = pose.far;
    if (introEnabled && shouldRunIntroTransition() && (wasUnfitted || runningIntro)) {
      const targetVec = new THREE.Vector3(pose.target[0], pose.target[1], pose.target[2]);
      const endEyeVec = new THREE.Vector3(pose.eye[0], pose.eye[1], pose.eye[2]);
      const endSpherical = new THREE.Spherical().setFromVector3(endEyeVec.clone().sub(targetVec));
      const frameRatio =
        (typeof window !== "undefined" &&
          (window as Window & { __citycutFrameRatio?: number }).__citycutFrameRatio) ||
        0.48;
      const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
      const startRadius = Math.max(
        endSpherical.radius * 1.15,
        side / 2 / (Math.tan(halfFovRad) * frameRatio),
      );
      const startPhi = 0.005;
      const startTheta = 0;
      if (runningIntro && introAnimRef.current) {
        introAnimRef.current.target = targetVec;
        introAnimRef.current.endEye = endEyeVec;
        introAnimRef.current.endRadius = endSpherical.radius;
        introAnimRef.current.endPhi = endSpherical.phi;
        introAnimRef.current.endTheta = endSpherical.theta;
      } else {
        introAnimRef.current = {
          elapsedSec: 0,
          frameCount: 0,
          done: false,
          target: targetVec,
          endEye: endEyeVec,
          startRadius,
          endRadius: endSpherical.radius,
          startPhi,
          endPhi: endSpherical.phi,
          startTheta,
          endTheta: endSpherical.theta,
        };
      }
      applyIntroPose(introAnimRef.current, controls);
    } else {
      camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
      controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
    }
    fittedKey.current = key;
    touchedRef.current = false;
  }, [
    applyIntroPose,
    introEnabled,
    active,
    camera,
    controlsRef,
    fitId,
    groundY,
    lift,
    side,
    siteTopY,
    heliodonRadius,
    solar,
    lat,
    lon,
    size.height,
    size.width,
    touchedRef,
  ]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useFrame((_state, delta) => {
    place();
    const anim = introAnimRef.current;
    if (!anim || anim.done) return;
    const controls = controlsRef.current;
    if (!active || !controls || touchedRef.current) {
      anim.done = true;
      introAnimRef.current = null;
      return;
    }

    const waitingForIntroStart =
      typeof window !== "undefined" &&
      Boolean(window.__citycutAwaitIntroStart) &&
      !window.__citycutIntroStarted;
    if (anim.frameCount < 3 || waitingForIntroStart) {
      anim.frameCount += 1;
      applyIntroPose(anim, controls);
      return;
    }
    const introPaused =
      typeof window !== "undefined" &&
      Boolean((window as Window & { __citycutIntroPaused?: boolean }).__citycutIntroPaused);
    if (!anim.playingStarted) {
      anim.playingStarted = true;
      anim.elapsedSec = 0.02;
      applyIntroPose(anim, controls);
      return;
    }
    if (introPaused) {
      (anim as { wasPaused?: boolean }).wasPaused = true;
    } else if ((anim as { wasPaused?: boolean }).wasPaused) {
      (anim as { wasPaused?: boolean }).wasPaused = false;
      anim.elapsedSec += 0.032;
    } else {
      anim.elapsedSec += Math.min(Math.max(delta, 0.001), 0.14);
    }
    if (anim.elapsedSec >= INTRO_TRANSITION_SEC) {
      flushControlInertia(controls);
      camera.position.copy(anim.endEye);
      controls.target.copy(anim.target);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      controls.update();
      gl.domElement.dataset.introPolar = anim.endPhi.toFixed(3);
      gl.domElement.dataset.introRadius = anim.endRadius.toFixed(1);
      anim.done = true;
      introAnimRef.current = null;
      return;
    }
    applyIntroPose(anim, controls);
  });
  return null;
}

function PerspectiveClipPlanes({
  camera,
  controlsRef,
  side,
  heliodonRadius,
  active,
}: {
  camera: THREE.PerspectiveCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  side: number;
  heliodonRadius: number;
  active: boolean;
}) {
  useFrame(() => {
    if (!active) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const distance = camera.position.distanceTo(controls.target);
    const near = Math.max(0.1, side / 400);
    const far = perspectiveClipFar(side, heliodonRadius, distance);
    if (Math.abs(camera.near - near) > 1e-4 || Math.abs(camera.far - far) > 1) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function IsoSnap({
  camera,
  controlsRef,
  boundsRef,
  corner,
  snapId,
  active,
  touchedRef,
  fittedKey,
  otherOrthoFittedKey,
  sideM,
  groundY,
  siteTopY,
  heliodonRadius,
  solar,
  lat,
  lon,
  extraBounds,
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  corner: IsoCorner;
  snapId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
  fittedKey: MutableRefObject<string | null>;
  otherOrthoFittedKey?: MutableRefObject<string | null>;
  sideM: number;
  groundY: number;
  siteTopY: number;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
  extraBounds?: Aabb | null;
}) {
  const size = useThree((state) => state.size);
  const place = useCallback(() => {
    if (!active) return;
    const controls = controlsRef.current;
    if (!controls || size.width < 2 || size.height < 2) return;
    const bounds = boundsRef.current;
    if (!bounds) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
    // Resizes keep the pose and zoom; only a new snap id refits (see viewportAutoFit.ts).
    if (sameSnap) return;
    let fitBounds = bounds;
    if (CAMERA_FIT_INCLUDES_HELIODON && solar.showPath) {
      fitBounds = unionAabb(
        bounds,
        heliodonSceneBounds({
          lat,
          lon,
          year: solar.year,
          month: solar.month,
          day: solar.day,
          hour: solar.hour,
          minute: solar.minute,
          sideM,
          ringRadiusM: heliodonRadius,
          groundY,
          siteTopY,
        }),
      );
    }
    const centre = frameCentre(fitBounds);
    const direction = isoOffset(corner);
    const distance = eyeDistance(fitBounds);
    const eye = isoEye(centre, corner, distance);
    const clipBounds = extraBounds ? unionAabb(fitBounds, extraBounds) : fitBounds;
    const planes = orthoNearFar(clipBounds, eye, centre);
    flushControlInertia(controls);
    camera.up.set(ISO_CAMERA_UP[0], ISO_CAMERA_UP[1], ISO_CAMERA_UP[2]);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.near = planes.near;
    camera.far = planes.far;
    camera.zoom = fitOrthoZoom(fitBounds, direction, size.width, size.height);
    camera.updateProjectionMatrix();
    controls.target.set(centre[0], centre[1], centre[2]);
    camera.lookAt(controls.target);
    camera.up.set(ISO_CAMERA_UP[0], ISO_CAMERA_UP[1], ISO_CAMERA_UP[2]);
    holdControlPose(controls as HeldControl<THREE.Vector3>);
    fittedKey.current = key;
    if (otherOrthoFittedKey) otherOrthoFittedKey.current = null;
    touchedRef.current = false;
  }, [
    active,
    otherOrthoFittedKey,
    camera,
    controlsRef,
    boundsRef,
    corner,
    groundY,
    heliodonRadius,
    lat,
    lon,
    sideM,
    siteTopY,
    snapId,
    solar,
    size.width,
    size.height,
    touchedRef,
    extraBounds,
  ]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useFrame(() => {
    place();
  });
  return null;
}

function PlanSnap({
  camera,
  controlsRef,
  boundsRef,
  sideM,
  groundY,
  siteTopY,
  snapId,
  active,
  touchedRef,
  fittedKey,
  otherOrthoFittedKey,
  extraBounds,
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  sideM: number;
  groundY: number;
  siteTopY: number;
  snapId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
  fittedKey: MutableRefObject<string | null>;
  otherOrthoFittedKey?: MutableRefObject<string | null>;
  extraBounds?: Aabb | null;
}) {
  const size = useThree((state) => state.size);
  const place = useCallback(() => {
    if (!active) return;
    const controls = controlsRef.current;
    if (!controls || size.width < 2 || size.height < 2) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
    // Resizes keep the pose and zoom; only a new snap id refits (see viewportAutoFit.ts).
    if (sameSnap) return;
    const measured = boundsRef.current;
    const fitBounds = sitePlanBounds(sideM, groundY, siteTopY);
    if (measured) {
      fitBounds.min[1] = Math.min(fitBounds.min[1], measured.min[1]);
      fitBounds.max[1] = Math.max(fitBounds.max[1], measured.max[1]);
    }
    const centre = frameCentre(fitBounds);
    const distance = planEyeDistance(fitBounds);
    const eye = planEye(centre, distance);
    const clipBounds = extraBounds ? unionAabb(fitBounds, extraBounds) : fitBounds;
    const planes = planNearFar(clipBounds, centre);
    flushControlInertia(controls);
    camera.up.set(0, 0, -1);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.near = planes.near;
    camera.far = planes.far;
    camera.zoom = fitPlanOrthoZoom(fitBounds, size.width, size.height);
    camera.updateProjectionMatrix();
    controls.target.set(centre[0], centre[1], centre[2]);
    camera.lookAt(controls.target);
    camera.up.set(0, 0, -1);
    controls.update();
    fittedKey.current = key;
    if (otherOrthoFittedKey) otherOrthoFittedKey.current = null;
    touchedRef.current = false;
  }, [active, camera, controlsRef, boundsRef, extraBounds, groundY, otherOrthoFittedKey, sideM, siteTopY, snapId, size.width, size.height, touchedRef]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useFrame(() => {
    place();
  });
  return null;
}

function OrthoClip({
  camera,
  controlsRef,
  boundsRef,
  active,
  extraBounds,
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  active: boolean;
  /** Extra world bounds that must stay inside near/far (the heliodon dome and sun when shown). */
  extraBounds?: Aabb | null;
}) {
  useFrame(() => {
    if (!active) return;
    const controls = controlsRef.current;
    const measured = boundsRef.current;
    if (!controls || !measured) return;
    const bounds = extraBounds ? unionAabb(measured, extraBounds) : measured;
    const eye: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const target: Vec3 = [controls.target.x, controls.target.y, controls.target.z];
    const planes = orthoNearFar(bounds, eye, target);
    if (Math.abs(camera.near - planes.near) > 0.5 || Math.abs(camera.far - planes.far) > 0.5) {
      camera.near = planes.near;
      camera.far = planes.far;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function CameraReadout({
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
  const gl = useThree((state) => state.gl);
  useFrame(() => {
    const orthoView = projection === "iso" || projection === "plan";
    const camera = orthoView ? ortho : persp;
    const controls = orthoView ? orthoControls.current : perspControls.current;
    if (!controls) return;
    publishCamera(camera, controls.target, gl.domElement);
  });
  return null;
}

function HoldPoseWhenInactive({
  controlsRef,
  active,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  active: boolean;
}) {
  const previous = useRef(active);
  useFrame(() => {
    if (previous.current && !active) {
      const controls = controlsRef.current;
      if (controls) holdControlPose(controls);
    }
    previous.current = active;
  });
  return null;
}

function QaCameraBridgeRegister({
  persp,
  controlsRef,
  active,
  side,
  lift,
  groundY,
  siteTopY,
  heliodonRadius,
  solar,
  lat,
  lon,
}: {
  persp: THREE.PerspectiveCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  active: boolean;
  side: number;
  lift: number;
  groundY: number;
  siteTopY: number;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
}) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (!qaModeFromSearch(window.location.search) || !active) {
      registerQaCameraBridge(null);
      return;
    }
    const placeHeliodon = () => {
      const controls = controlsRef.current;
      if (!controls || !solar.showPath || size.width < 2 || size.height < 2) return;
      const bounds = heliodonSceneBounds({
        lat,
        lon,
        year: solar.year,
        month: solar.month,
        day: solar.day,
        hour: solar.hour,
        minute: solar.minute,
        sideM: side,
        ringRadiusM: heliodonRadius,
        groundY,
        siteTopY,
      });
      const target = frameCentre(bounds);
      const distance =
        perspectiveFitDistance(
          bounds,
          target,
          DEFAULT_PERSPECTIVE_OFFSET,
          persp.fov,
          size.width / Math.max(size.height, 1),
        ) * (1 + Math.max(0, solar.radiusFactor - 1) * 0.08);
      const eye = [
        target[0] + DEFAULT_PERSPECTIVE_OFFSET[0] * distance,
        target[1] + DEFAULT_PERSPECTIVE_OFFSET[1] * distance,
        target[2] + DEFAULT_PERSPECTIVE_OFFSET[2] * distance,
      ] as const;
      flushControlInertia(controls);
      persp.position.set(eye[0], eye[1], eye[2]);
      persp.near = Math.max(0.1, side / 400);
      persp.far = Math.max(side * 40, heliodonRadius * 28, distance * 2.5);
      controls.target.set(target[0], target[1], target[2]);
      persp.lookAt(controls.target);
      persp.updateProjectionMatrix();
      controls.update();
      invalidate();
    };
    registerQaCameraBridge({
      setCamera(pose: QaCameraPose) {
        const controls = controlsRef.current;
        if (!controls) return;
        persp.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
        controls.target.set(pose.target.x, pose.target.y, pose.target.z);
        controls.update();
        persp.updateProjectionMatrix();
        invalidate();
      },
      getCamera() {
        const controls = controlsRef.current;
        if (!controls) return null;
        const target = controls.target;
        return {
          eye: { x: persp.position.x, y: persp.position.y, z: persp.position.z },
          target: { x: target.x, y: target.y, z: target.z },
        };
      },
      frameHeliodon: placeHeliodon,
      projectToScreen(world) {
        const vec = new THREE.Vector3(world.x, world.y, world.z);
        vec.project(persp);
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: rect.left + (vec.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-vec.y * 0.5 + 0.5) * rect.height,
        };
      },
    });
    return () => registerQaCameraBridge(null);
  }, [
    active,
    controlsRef,
    gl,
    groundY,
    heliodonRadius,
    invalidate,
    lat,
    lift,
    lon,
    persp,
    side,
    siteTopY,
    size.height,
    size.width,
    solar,
  ]);
  return null;
}

function ExportBridge({
  onExportReady,
  solarDiagramOn,
}: {
  onExportReady: (exporter: SceneExporter | null) => void;
  solarDiagramOn: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  useLayoutEffect(() => {
    onExportReady({
      png: async () => {
        const city = scene.getObjectByName("CityCut");
        const render = () => captureViewPng(gl, scene, get().camera, exportFrameSize(gl.domElement));
        if (city && solarDiagramOn) return withBuildingExportColours(city, false, render);
        return render();
      },
      shot: () => {
        const frame = exportFrameSize(gl.domElement);
        return shotFromCamera(cameraForExportFrame(get().camera, frame.width, frame.height), frame.width, frame.height);
      },
    });
    return () => onExportReady(null);
  }, [gl, scene, get, onExportReady, solarDiagramOn]);
  return null;
}

/**
 * Puts back the camera the user left when the 3D tab was unmounted (Drawing/Satellite round trip),
 * and keeps a copy of the live camera every frame. Runs after both OrbitControls are mounted, and
 * restores the fit keys and the touched flag before the first frame, so no auto-fit fires.
 */
function CameraMemoryBridge({
  memoryRef,
  snapId,
  persp,
  ortho,
  perspControls,
  orthoControls,
  fittedKeys,
  touchedRef,
}: {
  memoryRef: CameraMemoryRef | undefined;
  snapId: number;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  perspControls: RefObject<OrbitControlsImpl | null>;
  orthoControls: RefObject<OrbitControlsImpl | null>;
  fittedKeys: {
    persp: MutableRefObject<string | null>;
    iso: MutableRefObject<string | null>;
    plan: MutableRefObject<string | null>;
  };
  touchedRef: MutableRefObject<boolean>;
}) {
  useLayoutEffect(() => {
    const memory = usableCameraMemory(memoryRef?.current ?? null, snapId);
    const pc = perspControls.current;
    const oc = orthoControls.current;
    if (!memory || !pc || !oc) return;
    for (const [camera, controls, pose] of [
      [persp, pc, memory.persp],
      [ortho, oc, memory.ortho],
    ] as const) {
      flushControlInertia(controls);
      applyPose(camera, controls, pose);
    }
    fittedKeys.persp.current = memory.fittedKeys.persp;
    fittedKeys.iso.current = memory.fittedKeys.iso;
    fittedKeys.plan.current = memory.fittedKeys.plan;
    touchedRef.current = memory.touched;
    // Mount-only: later prop changes must not re-apply an old pose.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (!memoryRef) return;
    const pc = perspControls.current;
    const oc = orthoControls.current;
    if (!pc || !oc) return;
    const next: CameraMemory = {
      snapId,
      persp: capturePose(persp, pc),
      ortho: capturePose(ortho, oc),
      fittedKeys: { persp: fittedKeys.persp.current, iso: fittedKeys.iso.current, plan: fittedKeys.plan.current },
      touched: touchedRef.current,
    };
    memoryRef.current = next;
    // Default priority: a positive priority would take over rendering in react-three-fiber.
  });
  return null;
}

export function Cameras({
  side,
  lift,
  groundY,
  siteTopY,
  projection,
  corner,
  freeRotate,
  snapId,
  boundsRef,
  onExportReady,
  solarDiagramOn,
  heliodonRadius,
  solar,
  lat,
  lon,
  cameraMemory,
  introEnabled = false,
}: {
  side: number;
  lift: number;
  groundY: number;
  siteTopY: number;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
  boundsRef: RefObject<Aabb | null>;
  onExportReady: (exporter: SceneExporter | null) => void;
  solarDiagramOn: boolean;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
  cameraMemory?: CameraMemoryRef;
  introEnabled?: boolean;
}) {
  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const perspControls = useRef<OrbitControlsImpl | null>(null);
  const orthoControls = useRef<OrbitControlsImpl | null>(null);
  const touchedRef = useRef(false);
  const perspFitKey = useRef<string | null>(null);
  const isoFitKey = useRef<string | null>(null);
  const planFitKey = useRef<string | null>(null);
  const fittedKeys = useMemo(() => ({ persp: perspFitKey, iso: isoFitKey, plan: planFitKey }), []);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const persp = perspRef.current;
    const ortho = orthoRef.current;
    if (!persp || !ortho) return;
    (persp as FiberCamera).manual = true;
    (ortho as FiberCamera).manual = true;
    setReady(true);
  }, []);
  const iso = projection === "iso";
  const plan = projection === "plan";
  const orthoView = iso || plan;
  // The ortho clip planes are fitted to the measured site. Without the dome in that box, the
  // heliodon, sun and compass sit outside near/far in Iso view and are clipped away entirely.
  const heliodonClipBounds = useMemo(
    () =>
      orthoView && solar.showPath
        ? heliodonSceneBounds({
            lat,
            lon,
            year: solar.year,
            month: solar.month,
            day: solar.day,
            hour: solar.hour,
            minute: solar.minute,
            sideM: side,
            ringRadiusM: heliodonRadius,
            groundY,
            siteTopY,
          })
        : null,
    [orthoView, solar.showPath, solar.year, solar.month, solar.day, solar.hour, solar.minute, lat, lon, side, heliodonRadius, groundY, siteTopY],
  );
  const persp = perspRef.current;
  const ortho = orthoRef.current;
  const qaMode = typeof window !== "undefined" && qaModeFromSearch(window.location.search);

  return (
    <>
      <perspectiveCamera ref={perspRef} fov={32} />
      <orthographicCamera ref={orthoRef} />
      {ready && persp && ortho && (
        <>
          <BindCamera camera={orthoView ? ortho : persp} />
          <FrameCameras persp={persp} ortho={ortho} />
          <PerspectiveFit
            camera={persp}
            controlsRef={perspControls}
            side={side}
            lift={lift}
            groundY={groundY}
            siteTopY={siteTopY}
            heliodonRadius={heliodonRadius}
            solar={solar}
            lat={lat}
            lon={lon}
            fitId={snapId}
            active={!orthoView && !qaMode}
            touchedRef={touchedRef}
            fittedKey={perspFitKey}
            introEnabled={introEnabled}
          />
          <PerspectiveClipPlanes
            camera={persp}
            controlsRef={perspControls}
            side={side}
            heliodonRadius={heliodonRadius}
            active={!orthoView}
          />
          <QaCameraBridgeRegister
            persp={persp}
            controlsRef={perspControls}
            active={!orthoView}
            side={side}
            lift={lift}
            groundY={groundY}
            siteTopY={siteTopY}
            heliodonRadius={heliodonRadius}
            solar={solar}
            lat={lat}
            lon={lon}
          />
          <HoldPoseWhenInactive controlsRef={perspControls} active={!orthoView} />
          <HoldPoseWhenInactive controlsRef={orthoControls} active={orthoView} />
          <IsoSnap
            camera={ortho}
            controlsRef={orthoControls}
            boundsRef={boundsRef}
            corner={corner}
            snapId={snapId}
            active={iso}
            touchedRef={touchedRef}
            fittedKey={isoFitKey}
            otherOrthoFittedKey={planFitKey}
            sideM={side}
            groundY={groundY}
            siteTopY={siteTopY}
            heliodonRadius={heliodonRadius}
            solar={solar}
            lat={lat}
            lon={lon}
            extraBounds={heliodonClipBounds}
          />
          <PlanSnap
            camera={ortho}
            controlsRef={orthoControls}
            boundsRef={boundsRef}
            sideM={side}
            groundY={groundY}
            siteTopY={siteTopY}
            snapId={snapId}
            active={plan}
            touchedRef={touchedRef}
            fittedKey={planFitKey}
            otherOrthoFittedKey={isoFitKey}
            extraBounds={heliodonClipBounds}
          />
          <OrthoClip camera={ortho} controlsRef={orthoControls} boundsRef={boundsRef}
            active={orthoView}
            extraBounds={heliodonClipBounds}
          />
          <OrbitControls
            ref={perspControls}
            camera={persp}
            makeDefault={!orthoView}
            enabled={!orthoView}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.02}
            minDistance={side * 0.2}
            maxDistance={Math.max(side * 6, heliodonRadius * 2.4)}
            onStart={() => {
              touchedRef.current = true;
            }}
          />
          <OrbitControls
            ref={orthoControls}
            camera={ortho}
            makeDefault={orthoView}
            enabled={orthoView}
            enableDamping
            dampingFactor={0.08}
            enableRotate={iso && freeRotate}
            zoomToCursor
            maxPolarAngle={Math.PI / 2.02}
            minDistance={1}
            maxDistance={Math.max(side * 20, heliodonRadius * 2.4)}
            mouseButtons={{
              LEFT: plan || !freeRotate ? MOUSE.PAN : MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            touches={{
              ONE: plan || !freeRotate ? TOUCH.PAN : TOUCH.ROTATE,
              TWO: TOUCH.DOLLY_PAN,
            }}
            onStart={() => {
              touchedRef.current = true;
            }}
          />
          <CameraMemoryBridge
            memoryRef={cameraMemory}
            snapId={snapId}
            persp={persp}
            ortho={ortho}
            perspControls={perspControls}
            orthoControls={orthoControls}
            fittedKeys={fittedKeys}
            touchedRef={touchedRef}
          />
          <CameraReadout
            projection={projection}
            persp={persp}
            ortho={ortho}
            perspControls={perspControls}
            orthoControls={orthoControls}
          />
          <ExportBridge onExportReady={onExportReady} solarDiagramOn={solarDiagramOn} />
        </>
      )}
    </>
  );
}

function WindLayer({
  sideM,
  terrain,
  table,
  period,
  enabled,
  animateStreaks,
}: {
  sideM: number;
  terrain?: import("../types").TerrainField | null;
  table: WindRoseTable | null;
  period: WindPeriodId;
  enabled: boolean;
  animateStreaks: boolean;
}) {
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && !document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!enabled || !table) return null;
  const stats = analyzeWindPeriod(table, period);
  if (!animateStreaks) return <WindStaticArrows sideM={sideM} stats={stats} terrain={terrain} />;
  return <WindStreaks sideM={sideM} stats={stats} animate={visible} terrain={terrain} />;
}

export function Scene3D({
  model,
  uniformBuildings,
  colourBySource,
  showManualEdits,
  projection,
  corner,
  freeRotate,
  snapId,
  solar,
  windEnabled,
  windTable,
  windPeriod,
  windAnimateStreaks,
  onExportReady,
  onBuildingPick,
  onClearBuildingPick,
  heightEditBuildingId,
  selectedBuildingIds,
  cameraMemory,
  display,
  importedMassing = null,
  walkLayer = null,
  onScenePoint = null,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  showManualEdits: boolean;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
  solar: SolarViewSettings;
  windEnabled: boolean;
  windTable: WindRoseTable | null;
  windPeriod: WindPeriodId;
  windAnimateStreaks: boolean;
  onExportReady: (exporter: SceneExporter | null) => void;
  onBuildingPick: (buildingId: number, clientX: number, clientY: number, additive?: boolean) => void;
  onClearBuildingPick?: () => void;
  heightEditBuildingId: number | null;
  selectedBuildingIds?: readonly number[];
  /** Survives the 3D tab unmounting; see CameraMemory. Omit to always frame afresh. */
  cameraMemory?: CameraMemoryRef;
  display: View3dDisplaySettings;
  /** Imported massing, already in the local frame. Never measured for camera framing. */
  importedMassing?: THREE.Object3D | null;
  /** View tab walk overlay (path, visibility, walker), in the local frame. Never measured for camera framing. */
  walkLayer?: THREE.Object3D | null;
  /** Click-to-place: while set, a click reports the scene point (east, north, up) instead of picking a building. */
  onScenePoint?: ((east: number, north: number, up: number) => void) | null;
}) {
  const boundsRef = useRef<Aabb | null>(null);
  const onBounds = useCallback((bounds: Aabb) => {
    boundsRef.current = bounds;
  }, []);
  const lift = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
  const colourTick = useColourRevision();
  const modelBg = useMemo(() => themeColor("--model-bg"), [colourTick]);
  const sky = getColour("--light-sky");
  const groundLight = getColour("--light-ground");
  const groundY = model.terrain ? model.terrain.min : 0;
  const plinthBottomY = basePlinthBottomY(model.sideM, model.terrain);
  const solarNeutralFill = useMemo(() => getColour("--building-solar-neutral"), [colourTick]);
  const sunSample = useMelbourneSunSample(model.center.lat, model.center.lon, solar);
  const [glEpoch, setGlEpoch] = useState(0);
  const [glContextLost, setGlContextLost] = useState(false);
  const onGlContextLost = useCallback(() => setGlContextLost(true), []);
  const onGlContextRestored = useCallback(() => {
    setGlContextLost(false);
    setGlEpoch((value) => value + 1);
  }, []);
  const restoreGlContext = useCallback(() => {
    setGlContextLost(false);
    setGlEpoch((value) => value + 1);
  }, []);
  const viewportLight = sunStudyViewportLighting({
    showPath: solar.showPath && !display.whiteCard,
    castShadows: solar.castShadows,
  });
  const cardLight = whiteCardViewportLighting(display.whiteCard);
  const fillKeyLight = display.whiteCard ? cardLight.fillKeyLight : viewportLight.fillKeyLight;
  const fillAmbient = display.whiteCard ? cardLight.fillAmbient : viewportLight.fillAmbient;
  const fillHemi = display.whiteCard ? cardLight.fillHemi : viewportLight.fillHemi;
  const { sunIntensity, noToneMapping } = viewportLight;
  const heliodonRadius = heliodonRadiusM(model.sideM, solar.radiusFactor);
  const shadowTargetY = groundY;
  const siteTopY = useMemo(() => {
    let top = model.terrain ? model.terrain.max : 0;
    const base = model.terrain ? model.terrain.max : 0;
    for (const building of model.buildings) top = Math.max(top, base + building.height);
    return top;
  }, [model]);
  return (
    <div className="scene-viewport">
      {glContextLost ? (
        <div className="webgl-lost-overlay" role="alert">
          <p>3D view lost (GPU memory)</p>
          <button type="button" className="primary" onClick={restoreGlContext}>
            Restore
          </button>
        </div>
      ) : null}
      <Canvas
        key={glEpoch}
        className="scene-canvas"
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: qaModeFromSearch(window.location.search),
        }}
        shadows={solar.castShadows}
        style={{ overflow: "visible" }}
        events={insetPointerEvents}
      >
        <ViewInset />
        <WebGlContextWatch onContextLost={onGlContextLost} onContextRestored={onGlContextRestored} />
        <RendererShadows enabled={solar.castShadows} />
      <SunStudyToneMapping noToneMapping={noToneMapping} />
      <GradientSky colourTick={colourTick} fallback={modelBg} />
      {projection !== "plan" && <GroundGrid sideM={model.sideM} groundY={plinthBottomY} colourTick={colourTick} />}
      <hemisphereLight args={[sky, groundLight, fillHemi]} />
      <ambientLight intensity={fillAmbient} />
      <directionalLight position={[model.sideM * 0.4, model.sideM, model.sideM * 0.2]} intensity={fillKeyLight} />
      <SolarLight
        sample={sunSample}
        sideM={Math.max(model.sideM, heliodonRadius * 0.5)}
        enabled={solar.castShadows}
        intensity={sunIntensity}
        targetY={shadowTargetY}
        topY={siteTopY}
      />
      {SUN_HOURS_HEATMAP_ENABLED && solar.sunHours && (
        <SunHoursLayer model={model} year={solar.year} month={solar.month} day={solar.day} groundY={groundY} />
      )}
      <City
        model={model}
        uniformBuildings={uniformBuildings}
        colourBySource={colourBySource}
        highlightManual={showManualEdits && model.manualHeightEditCount !== undefined && model.manualHeightEditCount > 0}
        solarDiagramOn={solar.showPath}
        solarNeutralFill={solarNeutralFill}
        onBounds={onBounds}
        onBuildingPick={onBuildingPick}
        onClearBuildingPick={onClearBuildingPick}
        pickBuildings={model.layers.buildings && !onScenePoint}
        heightEditBuildingId={heightEditBuildingId}
        selectedBuildingIds={selectedBuildingIds}
        display={display}
      />
      {importedMassing ? <primitive object={importedMassing} /> : null}
      {walkLayer ? <primitive object={walkLayer} /> : null}
      {onScenePoint ? <ScenePointLayer onScenePoint={onScenePoint} /> : null}
      <SolarHeliodon
        lat={model.center.lat}
        lon={model.center.lon}
        sideM={model.sideM}
        groundY={groundY}
        terrain={model.terrain ?? undefined}
        settings={solar}
      />
      <WindLayer
        sideM={model.sideM}
        terrain={model.terrain}
        table={windTable}
        period={windPeriod}
        enabled={windEnabled}
        animateStreaks={windAnimateStreaks}
      />
      <Cameras
        side={model.sideM}
        lift={lift}
        groundY={groundY}
        siteTopY={siteTopY}
        projection={projection}
        corner={corner}
        freeRotate={freeRotate}
        snapId={snapId}
        boundsRef={boundsRef}
        onExportReady={onExportReady}
        solarDiagramOn={solar.showPath}
        heliodonRadius={heliodonRadius}
        solar={solar}
        lat={model.center.lat}
        lon={model.center.lon}
        cameraMemory={cameraMemory}
        introEnabled
      />
      </Canvas>
    </div>
  );
}
