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
import { attachScenePointPick } from "../lib/buildingPick";
import { attachSceneInspectPick, type SceneInspectWorld, type SceneSelection } from "../lib/sceneInspectPick";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
import { basePlinthBottomY, terrainTint } from "../lib/terrain";
import { GROUND_ROADS_LAYER } from "../lib/groundRoads";
import { hudSafeArea, type ScreenRect } from "../lib/heliodonSunDome";
import { siteFrameFromModel } from "../lib/modelFrame";
import { outline, type SiteFrame } from "../lib/siteFrame";
import { auditBuildingSelection, mountSelectedBuildingsVisual } from "../lib/buildingSelectionVisual";
import { CAMERA_FIT_INCLUDES_HELIODON } from "../lib/sceneCameraFit";
import { shotFromCamera, type CameraShot } from "../lib/cameraShot";
import { getColour } from "../lib/colours";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import { captureViewPng } from "../lib/capturePng";
import { StudioSky, ViewInset, insetPointerEvents } from "./SceneBackdrop";
import { INTRO_ACTIVE_KEY, StudioEffects, useCameraMoving } from "./StudioEffects";
import type { RenderQuality } from "../lib/renderQuality";
import { markScreenOnly } from "../lib/screenOnly";
import { cameraForExportFrame, exportFrameSize } from "../lib/exportFrame";
import { flushControlInertia, holdControlPose, type HeldControl } from "../lib/controlInertia";
import { shouldKeepPresetPose, shouldSkipViewportSizeRefit } from "../lib/viewportAutoFit";
import {
  applyPose,
  capturePose,
  usableCameraMemory,
  type CameraMemory,
  type CameraMemoryRef,
  type CameraRestoreRequest,
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
import { createQaPerfBridge, registerQaPerfBridge, tickPerfSample } from "../lib/qaPerfBridge";
import {
  patchSceneContinuousFlags,
  sceneNeedsContinuousRender,
} from "../lib/sceneRenderLoop";
import { WebGlContextWatch } from "./WebGlContextWatch";
import type { ProjectionMode } from "../lib/viewMemory";
import { isLayer3dVisible, monoViewActive, treesVisibleIn3d, type View3dDisplaySettings } from "../lib/view3dDisplay";
import { buildContourLineObject, contourLineMaterials } from "../lib/contourLines3d";
import {
  applyPrimaryViewportTint,
  snapshotPrimaryViewportColors,
  applyCanvasRoadTint,
} from "../lib/primaryViewport";
import { applyWhiteCardGroundTint, snapshotWhiteCardTerrainColors } from "../lib/whiteCardViewport";
import { studioCameraHeadingDeg } from "../lib/studioCompass";
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
import { studioSceneLighting } from "../lib/sunStudyViewport";
import { applySolarGreyscale, restoreFlatWater } from "../lib/solarGreyscale";
import { SunHoursLayer } from "./SunHoursLayer";
import { hidePickedMassingForSunHours, setSunHoursMassingFillVisible } from "../lib/sunHoursFaceTint";
import {
  sunHoursFacesReplaceMassing,
  sunHoursSelectionVisualIds,
  sunHoursGroundShown,
  sunHoursOverlayForBuildings,
} from "../lib/sunHoursPicked";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import { SectionKnifeScene } from "./SectionKnifeScene";
import { selectedKnife, type SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { SectionKnifePose } from "../lib/sectionKnife/plane";
import {
  idleSectionKnifeGizmoInteraction,
  type SectionKnifeGizmoInteraction,
} from "../lib/sectionKnife/gizmoHit";
import type { WalkRippleBuildingTint } from "../lib/walkRippleBuildingTint";
import {
  SolarHeliodon,
  SolarLight,
  canvasScreenRect,
  liveHudRects,
  useMelbourneSunSample,
  type SolarViewSettings,
} from "./SolarHeliodon";
import { GroundWindFlow } from "./GroundWindFlow";
import { WindDiagramStreams } from "./WindDiagramStreams";
import type { PrevailingStream } from "../lib/windPrevailingStreams";
import { createWindPlanTransformStore, WindPlanOverlay, WindPlanProjector } from "./WindPlanOverlay";
import type { WindPlanState } from "./useWindPlan";
import { InspectHudProjector, type InspectHudScreen } from "./InspectHudProjector";
import { captureViewportPng, readViewportCapture, sheetCropRect, type ViewportPngOptions } from "../lib/captureViewportPng";
import { planSheetFrame, type SheetFrame } from "../lib/sheetScale";
import { LandmarkLabelProjector, type LandmarkExportLabels, type LandmarkScreenState } from "./LandmarkLabelProjector";
import type { LandmarkLabelSource } from "../lib/landmarkLabels";
import type { WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { headingPeriodStats, type DesignWind } from "../lib/windDesignWinds";
import type { CityModel, TerrainField } from "../types";
import { introAlreadyPlayedForCut, markIntroPlayedForCut, modelCutSiteId } from "../lib/introPlayed";
import {
  EXPLODE_LAYERS,
  EXPLODE_LAYER_LABELS,
  easeInOutCubic as explodeEase,
  boundaryLabelAnchor,
  explodeClockAt,
  explodedBounds,
  explodeFit,
  explodeLabelOpacity,
  explodeLayerOfObjectName,
  explodeLayerOfSelectionKind,
  explodeOffsets,
  explodeCornerPoints,
  explodeCornerSpan,
  explodeOutlineSpecs,
  EXPLODE_CORNER_DASH_PX,
  EXPLODE_CORNER_GAP_PX,
  type ExplodeCornerSpan,
  explodeLabelSafeRect,
  layoutExplodeLabels,
  noExplodeBoxes,
  noExplodeOffsets,
  prefersReducedMotion,
  type ExplodeFit,
  type ExplodeLayerBoxes,
  type ExplodeLayerId,
  type ExplodeLayerOffsets,
} from "../lib/modelExplode";

const NO_LANDMARKS: readonly LandmarkLabelSource[] = [];

export type SceneExporter = {
  png: () => Promise<Blob>;
  viewportPng: (options?: ViewportPngOptions) => Promise<Blob>;
  sheetFrame: (crop: { aspect: number; minWidthPx: number }) => SheetFrame | null;
  shot: () => CameraShot;
};

type FiberCamera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean };

const INTRO_BASE_MS = 2100;
export const INTRO_TRANSITION_MS = 3500;
const INTRO_TIME_SCALE = INTRO_TRANSITION_MS / INTRO_BASE_MS;
const INTRO_TRANSITION_SEC = INTRO_TRANSITION_MS / 1000;
const INTRO_HOLD_RELEASE_SEC = INTRO_TRANSITION_SEC;
export const INTRO_UNDERLAY_FADE_EXP = 1.65;
export const INTRO_UNDERLAY_LEAD_MS = 200;
export const INTRO_CUT_RING_FADE_SEC = 0.15;
export function computeIntroCutRingOpacity(elapsedSec: number): number {
  return Math.max(0, 1 - Math.max(0, elapsedSec) / INTRO_CUT_RING_FADE_SEC);
}
const INTRO_UNDERLAY_FADE_SPAN = (INTRO_TRANSITION_MS - INTRO_UNDERLAY_LEAD_MS) / INTRO_TRANSITION_MS;

export function computeIntroUnderlayOpacity(progress: number): number {
  const p = Math.min(1, Math.max(0, progress) / INTRO_UNDERLAY_FADE_SPAN);
  return Math.max(0, 1 - Math.pow(p, INTRO_UNDERLAY_FADE_EXP));
}

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
  const bStart = (clampedBucket / 23) * 0.65 * INTRO_TIME_SCALE;
  const u = Math.min(1, Math.max(0, (elapsedSec - bStart) / (1.05 * INTRO_TIME_SCALE)));
  return 0.001 + 0.999 * easeInOutCubic(u);
}

export function computeIntroTreeBucketScale(elapsedSec: number, bucket: number): number {
  if (elapsedSec >= INTRO_TRANSITION_SEC) return 1;
  const clampedBucket = Math.max(0, Math.min(15, bucket));
  const tStart = (0.65 + (clampedBucket / 15) * 0.95) * INTRO_TIME_SCALE;
  const rawU = (elapsedSec - tStart) / (0.5 * INTRO_TIME_SCALE);
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

const STUDIO_FILL_RATIO = 0.28;

function measureObjectBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(root);
  const instanceBox = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  root.traverse((object) => {
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
  return box;
}

function aabbOfBox(box: THREE.Box3): Aabb {
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

function measureCity(group: THREE.Object3D): Aabb {
  const box = measureObjectBox(group);
  if (box.isEmpty()) return { min: [-1, 0, -1], max: [1, 1, 1] };
  return aabbOfBox(box);
}

export type ExplodeRuntime = {
  clock: number;
  progress: number;
  offsets: ExplodeLayerOffsets;
  boxes: ExplodeLayerBoxes;
  bounds: Aabb | null;
  fitToken: number;
};

export function createExplodeRuntime(): ExplodeRuntime {
  return { clock: 0, progress: 0, offsets: noExplodeOffsets(), boxes: noExplodeBoxes(), bounds: null, fitToken: 0 };
}

const EXPLODE_GROUND_FILL_NAME = "ExplodeGroundFill";
const EXPLODE_OUTLINES_NAME = "ExplodeOutlines";
const EXPLODE_CORNERS_NAME = "ExplodeCorners";

type ExplodeRun = { target: 0 | 1; from: number; startedAtMs: number };

function explodeViewRect(canvas: HTMLCanvasElement, size: { width: number; height: number }): ScreenRect {
  const shown = canvasScreenRect(canvas);
  return { left: shown.right - size.width, top: shown.top, right: shown.right, bottom: shown.top + size.height };
}

function explodeSafeRect(view: ScreenRect): ScreenRect {
  return hudSafeArea(view, liveHudRects(view));
}

function explodeFitIn(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  bounds: Aabb,
  corner: IsoCorner,
  progress: number,
): ExplodeFit {
  const view = explodeViewRect(canvas, size);
  return explodeFit(bounds, isoOffset(corner), view, progress > 0 ? explodeSafeRect(view) : view, progress);
}

export function buildExplodeGroundFill(
  city: THREE.Object3D,
  terrain: Pick<TerrainField, "min" | "max">,
): THREE.Group | null {
  const fill = new THREE.Group();
  fill.name = EXPLODE_GROUND_FILL_NAME;
  fill.userData.skipRhinoExport = true;
  fill.userData.noScenePick = true;
  const ground = city.children.find((child) => child.name === "Terrain");
  for (const road of city.children) {
    if (road.name !== "Roads" || road.userData.exportLayer !== GROUND_ROADS_LAYER || !(road instanceof THREE.Mesh)) continue;
    const position = (road.geometry as THREE.BufferGeometry).getAttribute("position");
    const colours = new Float32Array(position.count * 3);
    for (let index = 0; index < position.count; index++) colours.set(terrainTint(terrain, position.getY(index)), index * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    const normal = (road.geometry as THREE.BufferGeometry).getAttribute("normal");
    if (normal) geometry.setAttribute("normal", normal);
    geometry.setIndex((road.geometry as THREE.BufferGeometry).getIndex());
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.source = road;
    mesh.userData.skipRhinoExport = true;
    mesh.userData.noScenePick = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = ground?.renderOrder ?? 0;
    fill.add(mesh);
  }
  return fill.children.length ? fill : null;
}

function disposeExplodeGroundFill(fill: THREE.Group) {
  fill.removeFromParent();
  for (const child of fill.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

export function buildExplodeOutlines(frame: SiteFrame, boxes: ExplodeLayerBoxes): THREE.Group | null {
  const ring = outline(frame)[0];
  if (!ring || ring.length < 3) return null;
  const group = new THREE.Group();
  group.name = EXPLODE_OUTLINES_NAME;
  group.userData.skipRhinoExport = true;
  group.userData.noScenePick = true;
  const points = (ring.at(-1)![0] === ring[0][0] && ring.at(-1)![1] === ring[0][1] ? ring.slice(0, -1) : ring).map(
    ([east, north]) => new THREE.Vector3(east, 0, -north),
  );
  for (const layer of EXPLODE_LAYERS) {
    if (!boxes[layer]) continue;
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: getColour("--ground-edge") }),
    );
    line.name = `${EXPLODE_OUTLINES_NAME}:${layer}`;
    line.userData.explodeLayer = layer;
    line.userData.skipRhinoExport = true;
    line.userData.noScenePick = true;
    line.raycast = () => {};
    group.add(line);
  }
  const corners = explodeCornerPoints(ring);
  if (corners.length && EXPLODE_LAYERS.filter((layer) => boxes[layer]).length > 1) {
    const cornerGroup = new THREE.Group();
    cornerGroup.name = EXPLODE_CORNERS_NAME;
    cornerGroup.userData.skipRhinoExport = true;
    cornerGroup.userData.noScenePick = true;
    corners.forEach(([east, north], index) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(east, 0, -north), new THREE.Vector3(east, 0, -north)]),
        new THREE.LineDashedMaterial({ color: getColour("--ground-edge"), dashSize: 1, gapSize: 1 }),
      );
      line.name = `${EXPLODE_CORNERS_NAME}:${index}`;
      line.frustumCulled = false;
      line.userData.skipRhinoExport = true;
      line.userData.noScenePick = true;
      line.raycast = () => {};
      cornerGroup.add(line);
    });
    group.add(cornerGroup);
  }
  return group.children.length ? group : null;
}

export function updateExplodeCorners(group: THREE.Object3D, span: ExplodeCornerSpan | null, camera: THREE.Camera) {
  const corners = group.getObjectByName(EXPLODE_CORNERS_NAME);
  if (!corners) return;
  corners.visible = span != null;
  if (!span) return;
  const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
  const verticalOnScreen = Math.max(0.1, Math.abs(camera.matrixWorld.elements[5]));
  const worldPerPx = 1 / (zoom * verticalOnScreen);
  for (const child of corners.children) {
    const line = child as THREE.Line;
    const material = line.material as THREE.LineDashedMaterial;
    material.dashSize = EXPLODE_CORNER_DASH_PX * worldPerPx;
    material.gapSize = EXPLODE_CORNER_GAP_PX * worldPerPx;
    line.position.y = span.baseY;
    const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (position.getY(1) !== span.heightM) {
      position.setY(1, span.heightM);
      position.needsUpdate = true;
      line.computeLineDistances();
    }
  }
}

function disposeExplodeOutlines(group: THREE.Group) {
  group.removeFromParent();
  group.traverse((child) => {
    if (!(child instanceof THREE.Line)) return;
    child.geometry.dispose();
    (child.material as THREE.Material).dispose();
  });
}

type ExplodeLift = { restY: number; offset: number };

export function measureExplodeLayers(
  city: THREE.Object3D,
  importedMassing: THREE.Object3D | null,
  overlay: THREE.Object3D | null,
  applied: WeakMap<THREE.Object3D, ExplodeLift>,
): ExplodeLayerBoxes {
  const merged = Object.fromEntries(EXPLODE_LAYERS.map((layer) => [layer, new THREE.Box3()])) as Record<
    ExplodeLayerId,
    THREE.Box3
  >;
  const settle = new THREE.Vector3();
  const include = (object: THREE.Object3D, layer: ExplodeLayerId, liftedBy: number) => {
    if (!object.visible) return;
    const box = measureObjectBox(object);
    if (box.isEmpty()) return;
    merged[layer].union(box.translate(settle.set(0, -liftedBy, 0)));
  };
  for (const child of city.children) {
    if (child.name === "IntroCutRing" || child.name === EXPLODE_OUTLINES_NAME) continue;
    include(child, explodeLayerOfObjectName(child.name), applied.get(child)?.offset ?? 0);
  }
  if (importedMassing) include(importedMassing, "buildings", overlay?.position.y ?? 0);
  const boxes = noExplodeBoxes();
  for (const layer of EXPLODE_LAYERS) boxes[layer] = merged[layer].isEmpty() ? null : aabbOfBox(merged[layer]);
  return boxes;
}

export function applyExplodeOffsets(
  city: THREE.Object3D,
  overlay: THREE.Object3D | null,
  offsets: ExplodeLayerOffsets,
  applied: WeakMap<THREE.Object3D, ExplodeLift>,
): void {
  const lift = (object: THREE.Object3D, offset: number) => {
    const lifted = applied.get(object) ?? { restY: object.position.y, offset: 0 };
    if (lifted.offset === offset) return;
    lifted.offset = offset;
    object.position.y = lifted.restY + offset;
    applied.set(object, lifted);
  };
  for (const child of city.children) {
    if (child.name !== EXPLODE_OUTLINES_NAME) lift(child, offsets[explodeLayerOfObjectName(child.name)]);
  }
  if (overlay) lift(overlay, offsets.buildings);
}

export function ExplodeLayers({
  city,
  overlayRef,
  importedMassing,
  runtime,
  cityBoundsRef,
  exploded,
  gapM,
  measureKey,
  terrain,
  frame,
  snapKey = 0,
  onCollapsed,
  onTopLift,
}: {
  terrain?: Pick<TerrainField, "min" | "max"> | null;
  frame?: SiteFrame | null;
  snapKey?: number;
  city: THREE.Group;
  overlayRef: RefObject<THREE.Group | null>;
  importedMassing: THREE.Object3D | null;
  runtime: RefObject<ExplodeRuntime>;
  cityBoundsRef: RefObject<Aabb | null>;
  exploded: boolean;
  gapM: number;
  measureKey: string;
  onCollapsed: () => void;
  onTopLift: (liftM: number) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const applied = useRef(new WeakMap<THREE.Object3D, ExplodeLift>());
  const measured = useRef<{ city: THREE.Group; key: string } | null>(null);
  const fittedGap = useRef(gapM);
  const run = useRef<ExplodeRun | null>(null);
  const seenSnapKey = useRef(snapKey);
  const groundFill = useRef<{ city: THREE.Group; fill: THREE.Group | null } | null>(null);
  const dropGroundFill = useCallback(() => {
    if (groundFill.current?.fill) disposeExplodeGroundFill(groundFill.current.fill);
    groundFill.current = null;
  }, []);
  useEffect(() => dropGroundFill, [city, terrain, dropGroundFill]);
  const outlines = useRef<{ city: THREE.Group; frame: SiteFrame; boxes: ExplodeLayerBoxes; group: THREE.Group | null } | null>(null);
  const dropOutlines = useCallback(() => {
    if (outlines.current?.group) disposeExplodeOutlines(outlines.current.group);
    outlines.current = null;
  }, []);
  useEffect(() => dropOutlines, [city, frame, dropOutlines]);
  useEffect(() => {
    invalidate();
  }, [city, exploded, gapM, measureKey, invalidate]);
  useFrame((state) => {
    const rt = runtime.current;
    const dataset = state.gl.domElement.dataset;
    const introActive = state.scene.userData[INTRO_ACTIVE_KEY] === true;
    const target = exploded && !introActive ? 1 : 0;
    const nowMs = state.clock.elapsedTime * 1000;
    const snapped = seenSnapKey.current !== snapKey;
    seenSnapKey.current = snapKey;
    if (introActive || (snapped && target === 0)) rt.clock = 0;
    else if (snapped && snapKey !== 0 && target === 1) rt.clock = 1;
    if (introActive || snapped || run.current?.target !== target) run.current = { target, from: rt.clock, startedAtMs: nowMs };
    if (target === 0 && rt.clock === 0 && rt.progress === 0) {
      dropGroundFill();
      dropOutlines();
      dataset.exploded = "0";
      dataset.explodeProgress = "0.000";
      if (!exploded) onCollapsed();
      return;
    }
    const stale = measured.current?.city !== city || measured.current.key !== measureKey;
    if (stale) {
      rt.boxes = measureExplodeLayers(city, importedMassing, overlayRef.current, applied.current);
      measured.current = { city, key: measureKey };
    }
    const before = rt.progress;
    rt.clock = explodeClockAt(run.current.from, target, nowMs - run.current.startedAtMs, prefersReducedMotion());
    rt.progress = explodeEase(rt.clock);
    if (terrain && rt.progress > 0 && groundFill.current?.city !== city) {
      const fill = buildExplodeGroundFill(city, terrain);
      if (fill) city.add(fill);
      groundFill.current = { city, fill };
    }
    if (rt.progress === 0) {
      dropGroundFill();
      dropOutlines();
    }
    for (const mesh of groundFill.current?.fill?.children ?? []) mesh.visible = (mesh.userData.source as THREE.Object3D).visible;
    rt.offsets = explodeOffsets(rt.boxes, gapM, rt.progress);
    applyExplodeOffsets(city, overlayRef.current, rt.offsets, applied.current);
    if (frame && rt.progress > 0) {
      const held = outlines.current;
      if (!held || held.city !== city || held.frame !== frame || held.boxes !== rt.boxes) {
        dropOutlines();
        const group = buildExplodeOutlines(frame, rt.boxes);
        if (group) city.add(group);
        outlines.current = { city, frame, boxes: rt.boxes, group };
      }
      const group = outlines.current?.group;
      if (group) {
        const specs = explodeOutlineSpecs(rt.boxes, rt.offsets);
        for (const spec of specs) {
          const line = group.getObjectByName(`${EXPLODE_OUTLINES_NAME}:${spec.layer}`);
          if (line) line.position.y = spec.baseY;
        }
        updateExplodeCorners(group, explodeCornerSpan(specs), state.camera);
      }
    }
    if (stale || before !== rt.progress || fittedGap.current !== gapM) {
      fittedGap.current = gapM;
      const base = cityBoundsRef.current;
      rt.bounds = explodedBounds(base, rt.boxes, rt.offsets);
      if (!(snapped && target === 0)) rt.fitToken += 1;
      const stacked = explodedBounds(base, rt.boxes, explodeOffsets(rt.boxes, gapM, 1));
      onTopLift(stacked && base ? Math.max(0, Math.ceil(stacked.max[1] - base.max[1])) : 0);
    }
    dataset.exploded = rt.clock === 1 ? "1" : "0";
    dataset.explodeProgress = rt.progress.toFixed(3);
    if (rt.clock !== target) {
      state.invalidate();
    } else if (rt.clock === 0 && !exploded) {
      onTopLift(0);
      onCollapsed();
    }
  });
  return null;
}

function ExplodeLabelProjector({
  runtime,
  exploding,
  shown,
  frame,
  labelsRef,
  leadersRef,
}: {
  runtime: RefObject<ExplodeRuntime>;
  exploding: boolean;
  shown: boolean;
  frame: SiteFrame;
  labelsRef: RefObject<Partial<Record<ExplodeLayerId, HTMLElement | null>>>;
  leadersRef: RefObject<Partial<Record<ExplodeLayerId, SVGLineElement | null>>>;
}) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const point = useMemo(() => new THREE.Vector3(), []);
  const ring = useMemo(() => outline(frame)[0] ?? [], [frame]);
  useEffect(() => {
    invalidate();
  }, [shown, exploding, invalidate]);
  useFrame(({ camera }) => {
    const rt = runtime.current;
    const opacity = explodeLabelOpacity(rt.progress, exploding);
    const rect = opacity > 0 ? gl.domElement.getBoundingClientRect() : null;
    const view = rect ? explodeViewRect(gl.domElement, size) : null;
    camera.updateMatrixWorld();
    const right = camera.matrixWorld.elements;
    const shownLayers: ExplodeLayerId[] = [];
    const anchors: { x: number; y: number }[] = [];
    for (const layer of EXPLODE_LAYERS) {
      const box = rt.boxes[layer];
      const world =
        rect && view && box
          ? boundaryLabelAnchor(ring, box.min[1] + rt.offsets[layer], [right[0], right[1], right[2]])
          : null;
      if (!rect || !world) {
        const element = labelsRef.current[layer];
        if (element) element.style.opacity = "0";
        const leader = leadersRef.current[layer];
        if (leader) leader.style.opacity = "0";
        continue;
      }
      point.set(world[0], world[1], world[2]).project(camera);
      shownLayers.push(layer);
      anchors.push({
        x: rect.left + (point.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-point.y * 0.5 + 0.5) * rect.height,
      });
    }
    if (!view || !shownLayers.length) return;
    let width = 0;
    let height = 0;
    for (const layer of shownLayers) {
      const element = labelsRef.current[layer];
      if (!element) continue;
      width = Math.max(width, element.offsetWidth);
      height = Math.max(height, element.offsetHeight);
    }
    const safe = explodeLabelSafeRect(view, liveHudRects(view), width, anchors);
    const layout = layoutExplodeLabels(anchors, width, height, safe);
    shownLayers.forEach((layer, index) => {
      const element = labelsRef.current[layer];
      if (element) {
        element.style.left = `${layout.rightX}px`;
        element.style.top = `${layout.ys[index]}px`;
        element.style.opacity = opacity.toFixed(3);
      }
      const leader = leadersRef.current[layer];
      if (leader) {
        leader.setAttribute("x1", String(layout.rightX));
        leader.setAttribute("y1", String(layout.ys[index]));
        leader.setAttribute("x2", String(anchors[index].x));
        leader.setAttribute("y2", String(anchors[index].y));
        leader.style.opacity = anchors[index].x - layout.rightX > 1 ? opacity.toFixed(3) : "0";
      }
    });
  });
  return null;
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

function QaPerfSampler() {
  const state = useThree();
  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    registerQaPerfBridge(createQaPerfBridge(state));
    return () => registerQaPerfBridge(null);
  }, [state]);
  useFrame(() => {
    tickPerfSample(state, performance.now());
  });
  return null;
}

function AdaptiveViewportDpr() {
  const setDpr = useThree((state) => state.setDpr);
  const invalidate = useThree((state) => state.invalidate);
  const moving = useCameraMoving();
  useFrame(() => {
    if (typeof window === "undefined") return;
    const cap = Math.min(1.5, window.devicePixelRatio);
    const drop =
      typeof window !== "undefined" && window.__citycutPerfOverrides?.dprDropWhileOrbiting === true;
    setDpr(drop && moving.current ? 1 : cap);
  });
  useLayoutEffect(() => {
    invalidate();
  }, [invalidate]);
  return null;
}

function SceneDemandBootstrap() {
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    invalidate();
  }, [invalidate]);
  return null;
}

function SceneFrameloopGate({ introSkip }: { introSkip: boolean }) {
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const frameloopMode = () =>
    typeof window !== "undefined" && window.__citycutPerfOverrides?.frameloopAlways === true
      ? "always"
      : "demand";
  useLayoutEffect(() => {
    if (!shouldRunIntroTransition() || introSkip) {
      set({ frameloop: frameloopMode() });
      invalidate();
    }
  }, [set, invalidate, introSkip]);
  useEffect(() => {
    if (!shouldRunIntroTransition() || introSkip) return;
    const onIntroDone = () => {
      set({ frameloop: frameloopMode() });
      invalidate();
    };
    window.addEventListener("citycut:intro-done", onIntroDone);
    return () => window.removeEventListener("citycut:intro-done", onIntroDone);
  }, [set, invalidate, introSkip]);
  return null;
}

type SceneFrameloop = "always" | "demand" | "never";

function ScenePause({ active }: { active: boolean }) {
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const frameloop = useThree((state) => state.frameloop) as SceneFrameloop;
  const resumeTo = useRef<SceneFrameloop | null>(null);
  useLayoutEffect(() => {
    if (!active) {
      if (frameloop !== "never") {
        resumeTo.current = frameloop;
        set({ frameloop: "never" });
      }
      return;
    }
    if (resumeTo.current) {
      const next = resumeTo.current;
      resumeTo.current = null;
      set({ frameloop: next });
    }
    invalidate();
  }, [active, frameloop, set, invalidate]);
  return null;
}

function StudioCompassTracker({ onHeading }: { onHeading: (deg: number) => void }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    onHeading(studioCameraHeadingDeg(camera));
  });
  return null;
}

function SceneContinuousBridge({
  windAnimate,
  walkRippleActive,
}: {
  windAnimate: boolean;
  walkRippleActive: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const moving = useCameraMoving();
  useLayoutEffect(() => {
    patchSceneContinuousFlags(scene, { wind: windAnimate, walkRipple: walkRippleActive });
    invalidate();
  }, [scene, windAnimate, walkRippleActive, invalidate]);
  useFrame((state) => {
    const introActive = state.scene.userData[INTRO_ACTIVE_KEY] === true;
    if (sceneNeedsContinuousRender(state.scene, introActive, moving.current)) {
      state.invalidate();
    }
  });
  return null;
}

function SceneInspectPickLayer({
  root,
  model,
  enabled,
  buildingsPickable,
  treesPickable,
  importedMassing = null,
  onPick,
  onClear,
}: {
  root: THREE.Object3D;
  model: CityModel;
  enabled: boolean;
  buildingsPickable: boolean;
  treesPickable: boolean;
  importedMassing?: THREE.Object3D | null;
  onPick: (selection: SceneSelection) => void;
  onClear?: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  useLayoutEffect(() => {
    if (!enabled) return;
    const onPressStart = () => {
      const controls = get().controls as OrbitControlsImpl | null;
      if (controls?.enabled) holdControlPose(controls);
    };
    return attachSceneInspectPick(
      gl.domElement,
      camera,
      root,
      {
        trees: model.trees,
        terrain: model.terrain,
        sideM: model.sideM,
        buildingsPickable,
        treesPickable,
        extraRoots: importedMassing ? [importedMassing] : [],
      },
      { onPick, onClear, onPressStart },
    );
  }, [
    get,
    importedMassing,
    buildingsPickable,
    camera,
    enabled,
    gl.domElement,
    model.sideM,
    model.terrain,
    model.trees,
    onClear,
    onPick,
    root,
    treesPickable,
  ]);
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
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (buildingIds.length === 0) {
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      invalidate();
      return;
    }
    const mounted = mountSelectedBuildingsVisual(cityRoot, model, buildingIds, colourMode);
    if (!mounted) {
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      return;
    }
    cityRoot.add(mounted.overlay);
    invalidate();
    if (typeof window !== "undefined" && qaModeFromSearch(window.location.search)) {
      const publishAudit = () => {
        window.__citycutQaSelectionAudit = auditBuildingSelection(cityRoot, buildingIds, mounted.overlay);
        console.info("[CityCut selection]", window.__citycutQaSelectionAudit);
      };
      publishAudit();
      const frame = window.requestAnimationFrame(publishAudit);
      return () => {
        window.cancelAnimationFrame(frame);
        cityRoot.remove(mounted.overlay);
        mounted.restore();
        delete window.__citycutQaSelectionAudit;
      };
    }
    return () => {
      cityRoot.remove(mounted.overlay);
      mounted.restore();
    };
  }, [buildingIds, cityRoot, colourMode, model, invalidate]);
  return null;
}

function WalkRippleBuildingBinder({
  city,
  tint,
  buildingArrivals,
  colourTick,
}: {
  city: THREE.Group;
  tint: WalkRippleBuildingTint | null;
  buildingArrivals: Map<number, number> | null;
  colourTick: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (!tint || !buildingArrivals || buildingArrivals.size === 0) {
      tint?.detach();
      invalidate();
      return;
    }
    tint.refreshColours();
    tint.attach(city, buildingArrivals);
    invalidate();
    return () => tint.detach();
  }, [city, tint, buildingArrivals, colourTick, invalidate]);
  return null;
}

function WalkRippleTreeDim({ city, active }: { city: THREE.Group; active: boolean }) {
  useLayoutEffect(() => {
    if (!active) return;
    const saved: Array<{ mat: THREE.MeshStandardMaterial; opacity: number; transparent: boolean }> = [];
    city.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const item of materials) {
        if (!(item instanceof THREE.MeshStandardMaterial)) continue;
        if (item.name !== "TreeCrowns" && item.name !== "TreeTrunks") continue;
        saved.push({ mat: item, opacity: item.opacity, transparent: item.transparent });
        item.transparent = true;
        item.opacity = item.name === "TreeCrowns" ? 0.22 : 0.4;
        item.needsUpdate = true;
      }
    });
    return () => {
      for (const entry of saved) {
        entry.mat.opacity = entry.opacity;
        entry.mat.transparent = entry.transparent;
        entry.mat.needsUpdate = true;
      }
    };
  }, [active, city]);
  return null;
}

function City({
  model,
  uniformBuildings,
  colourBySource,
  highlightManual,
  solarDiagramOn,
  directSunHoursOn,
  sunHoursPickedOnly,
  solarNeutralFill,
  solarGreyscale,
  solarShadowsActive,
  heightEditBuildingId,
  selectedBuildingIds,
  display,
  onBounds,
  onSceneInspectPick,
  onClearSceneInspect,
  pickBuildings,
  onScenePoint,
  sectionKnife,
  onSectionKnifePoseChange,
  onSectionKnifeGizmoInteractionChange,
  projection,
  walkRippleTint,
  walkRippleArrivals,
  windFlowActive = false,
  introSkip,
  introPlayed,
  importedMassing = null,
  exploded,
  explodeGapM,
  explodeRuntime,
  explodeOverlayRef,
  cityBoundsRef,
  onExplodeCollapsed,
  onExplodeTopLift,
  explodeSnapKey,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  highlightManual: boolean;
  solarDiagramOn: boolean;
  directSunHoursOn: boolean;
  sunHoursPickedOnly: boolean;
  solarNeutralFill: string;
  solarGreyscale: boolean;
  solarShadowsActive: boolean;
  heightEditBuildingId: number | null;
  selectedBuildingIds?: readonly number[];
  display: View3dDisplaySettings;
  onBounds: (bounds: Aabb) => void;
  onSceneInspectPick: (selection: SceneSelection) => void;
  onClearSceneInspect?: () => void;
  pickBuildings: boolean;
  onScenePoint?: ((east: number, north: number, up: number) => void) | null;
  sectionKnife?: SectionKnifeToolState | null;
  onSectionKnifePoseChange?: (pose: SectionKnifePose) => void;
  onSectionKnifeGizmoInteractionChange?: (state: SectionKnifeGizmoInteraction) => void;
  projection: ProjectionMode;
  walkRippleTint?: WalkRippleBuildingTint | null;
  walkRippleArrivals?: Map<number, number> | null;
  windFlowActive?: boolean;
  introSkip: boolean;
  introPlayed?: { current: string | null };
  importedMassing?: THREE.Object3D | null;
  exploded: boolean;
  explodeGapM: number;
  explodeRuntime: RefObject<ExplodeRuntime>;
  explodeOverlayRef: RefObject<THREE.Group | null>;
  cityBoundsRef: RefObject<Aabb | null>;
  onExplodeCollapsed: () => void;
  onExplodeTopLift: (liftM: number) => void;
  explodeSnapKey: number;
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
  const cutKey = modelCutSiteId(model.center, model.sideM);
  const group = useMemo(() => {
    const introStagger = shouldRunIntroTransition() && !introSkip;
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
      const cutW = model.widthM ?? model.sideM;
      const cutH = model.heightM ?? model.sideM;
      const ringGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(cutW, 1.2, cutH));
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
    cutKey,
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
    introSkip,
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
  const introScene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
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
    if (!shouldRunIntroTransition() || introSkip || targets.length === 0) {
      for (const { obj } of targets) {
        obj.scale.y = 1;
        obj.position.y = 0;
      }
      if (cutRingObj) cutRingObj.visible = false;
      group.userData.introScaleY = 1;
      introRef.current = null;
      introScene.userData[INTRO_ACTIVE_KEY] = false;
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
          const ringOp = computeIntroCutRingOpacity(existing.elapsedSec);
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
    introScene.userData[INTRO_ACTIVE_KEY] = true;
    invalidate();
  }, [group, cutKey, introScene, invalidate, introSkip]);
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
      state.invalidate();
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
    const underlayOpacity = done ? 0 : computeIntroUnderlayOpacity(progress);

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
      const ringAlpha = done ? 0 : computeIntroCutRingOpacity(clampedElapsed);
      ring.visible = ringAlpha > 0.01;
      (ring.material as THREE.LineBasicMaterial).opacity = ringAlpha;
      ds.introCutRingOpacity = ringAlpha.toFixed(3);
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
      if (introPlayed) markIntroPlayedForCut(introPlayed, intro.cutKey);
      state.scene.userData[INTRO_ACTIVE_KEY] = false;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("citycut:intro-done"));
      }
    } else {
      state.invalidate();
    }
  });
  useLayoutEffect(() => {
    restoreFlatWater(group);
    refreshSceneSurfaceColors(group);
    snapshotBuildingViewportColors(group, colourMode);
    snapshotSunStudySurfaceColors(group);
    snapshotPrimaryViewportColors(group, colourMode);
    snapshotWhiteCardTerrainColors(group);
    applySunStudySurfaceTint(group, false);
    applyBuildingSolarNeutral(group, solarDiagramOn || directSunHoursOn, solarNeutralFill);
    applyPrimaryViewportTint(group, display.primaryView);
    if (display.primaryView) {
      applyWhiteCardGroundTint(group, false);
    } else if (colourMode.colourByUse || colourMode.colourBySource) {
      applyCanvasRoadTint(group, "primary");
      applyWhiteCardGroundTint(group, false);
    } else if (colourMode.uniformBuildings) {
      applyCanvasRoadTint(group, "white");
      applyWhiteCardGroundTint(group, true);
    } else {
      applyCanvasRoadTint(group, "off");
      applyWhiteCardGroundTint(group, false);
    }
    if (solarShadowsActive) applyCanvasRoadTint(group, "off");
    applySolarGreyscale(group, solarGreyscale);
    invalidate();
  }, [
    group,
    colourMode,
    solarDiagramOn,
    directSunHoursOn,
    solarNeutralFill,
    solarGreyscale,
    solarShadowsActive,
    colourTick,
    display.primaryView,
    invalidate,
  ]);
  const buildingsVisible = isLayer3dVisible(display, "buildings");
  const roadsVisible = isLayer3dVisible(display, "roads");
  const footpathsVisible = isLayer3dVisible(display, "footpaths");
  const landscapeVisible = isLayer3dVisible(display, "landscape");
  const waterVisible = isLayer3dVisible(display, "water");
  const railVisible = isLayer3dVisible(display, "rail");
  const contoursVisible = isLayer3dVisible(display, "contours");
  const treesVisible = treesVisibleIn3d(model.layers, display);
  useLayoutEffect(() => {
    setSunHoursMassingFillVisible(
      group,
      importedMassing,
      buildingsVisible,
      display.showOutlines,
      sunHoursFacesReplaceMassing(directSunHoursOn, sunHoursPickedOnly),
    );
    group.traverse((object) => {
      const name = object.name;
      if (
        name === "BuildingEdges" ||
        name === "Buildings" ||
        name === "Buildings-manual" ||
        name === "Buildings-site" ||
        name.startsWith("Buildings::") ||
        name.startsWith("source:")
      ) {
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
    importedMassing,
    directSunHoursOn,
    sunHoursPickedOnly,
    display.showOutlines,
    buildingsVisible,
    roadsVisible,
    footpathsVisible,
    landscapeVisible,
    waterVisible,
    railVisible,
  ]);
  const pickedMassingKey = (selectedBuildingIds ?? []).join(",");
  useLayoutEffect(() => {
    if (!directSunHoursOn || !sunHoursPickedOnly || !buildingsVisible || pickedMassingKey === "") return;
    const restore = hidePickedMassingForSunHours([group, importedMassing], pickedMassingKey.split(",").map(Number));
    return () => {
      restore();
      invalidate();
    };
  }, [
    group,
    importedMassing,
    directSunHoursOn,
    sunHoursPickedOnly,
    buildingsVisible,
    pickedMassingKey,
    display.showOutlines,
    invalidate,
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
    for (const mat of contourLineMaterials(contours)) {
      mat.color.setStyle(getColour("--outline-contour"));
      mat.transparent = windFlowActive;
      mat.opacity = windFlowActive ? 0.4 : 1;
    }
    invalidate();
  }, [contours, colourTick, invalidate, windFlowActive]);
  useLayoutEffect(() => {
    if (!contours) return;
    group.add(contours);
    return () => {
      contours.removeFromParent();
    };
  }, [contours, group, invalidate]);
  useLayoutEffect(() => () => disposeObject(group), [group]);
  const explodeFrame = useMemo(() => siteFrameFromModel(model), [model]);
  const explodeMeasureKey = [
    buildingsVisible,
    roadsVisible,
    footpathsVisible,
    landscapeVisible,
    waterVisible,
    railVisible,
    contoursVisible,
    treesVisible,
    display.showOutlines,
    importedMassing ? `${importedMassing.uuid}:${importedMassing.visible}:${importedMassing.children.length}` : "",
  ].join("|");
  return (
    <>
      <primitive object={group} />
      <ExplodeLayers
        city={group}
        overlayRef={explodeOverlayRef}
        importedMassing={importedMassing}
        runtime={explodeRuntime}
        cityBoundsRef={cityBoundsRef}
        exploded={exploded}
        gapM={explodeGapM}
        measureKey={explodeMeasureKey}
        terrain={model.terrain ?? null}
        frame={explodeFrame}
        snapKey={explodeSnapKey}
        onCollapsed={onExplodeCollapsed}
        onTopLift={onExplodeTopLift}
      />
      <WalkRippleBuildingBinder
        city={group}
        tint={walkRippleTint ?? null}
        buildingArrivals={walkRippleArrivals ?? null}
        colourTick={colourTick}
      />
      <WalkRippleTreeDim
        city={group}
        active={Boolean(walkRippleArrivals && walkRippleArrivals.size > 0)}
      />
      {contours ? <primitive object={contours} /> : null}
      <HeightEditOverlayLayer
        model={model}
        buildingIds={
          buildingsVisible
            ? selectedBuildingIds && selectedBuildingIds.length > 0
              ? sunHoursSelectionVisualIds(sunHoursPickedOnly, selectedBuildingIds)
              : heightEditBuildingId != null
                ? [heightEditBuildingId]
                : []
            : []
        }
        cityRoot={group}
        colourMode={colourMode}
      />
      <SceneInspectPickLayer
        root={group}
        model={model}
        enabled={!sectionKnife?.active && !onScenePoint}
        buildingsPickable={pickBuildings && buildingsVisible}
        treesPickable={Boolean(model.layers.trees) && treesVisible}
        importedMassing={importedMassing}
        onPick={onSceneInspectPick}
        onClear={onClearSceneInspect}
      />
      {sectionKnife?.active && onSectionKnifePoseChange ? (
        <SectionKnifeScene
          city={group}
          model={model}
          active
          pose={selectedKnife(sectionKnife).pose}
          onPoseChange={onSectionKnifePoseChange}
          onGizmoInteractionChange={onSectionKnifeGizmoInteractionChange}
          planView={projection === "plan"}
          snapWhileDrag={sectionKnife.snap}
        />
      ) : null}
    </>
  );
}

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
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    if (size.width < 2 || size.height < 2) return;
    persp.aspect = size.width / Math.max(size.height, 1);
    persp.updateProjectionMatrix();
    ortho.left = size.width / -2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = size.height / -2;
    ortho.updateProjectionMatrix();
    invalidate();
  }, [persp, ortho, size.width, size.height, invalidate]);
  return null;
}

export function useExplodeLive(exploded: boolean, restoreId: number) {
  const [engaged, setEngaged] = useState(false);
  const [seenRestoreId, setSeenRestoreId] = useState(restoreId);
  if (restoreId !== seenRestoreId) {
    setSeenRestoreId(restoreId);
    if (!exploded && engaged) setEngaged(false);
  } else if (exploded && !engaged) {
    setEngaged(true);
  }
  const onExplodeCollapsed = useCallback(() => setEngaged(false), []);
  return { explodeLive: exploded || engaged, onExplodeCollapsed };
}

function ExplodeHandoff({
  explodeLive,
  restoreId,
  projection,
  persp,
  ortho,
  perspControls,
  orthoControls,
  snapId,
  fittedKeys,
}: {
  explodeLive: boolean;
  restoreId: number;
  projection: ProjectionMode;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  perspControls: RefObject<OrbitControlsImpl | null>;
  orthoControls: RefObject<OrbitControlsImpl | null>;
  snapId: number;
  fittedKeys: {
    persp: MutableRefObject<string | null>;
    iso: MutableRefObject<string | null>;
    plan: MutableRefObject<string | null>;
  };
}) {
  const size = useThree((state) => state.size);
  const wasLive = useRef(explodeLive);
  const seenRestoreId = useRef(restoreId);
  useLayoutEffect(() => {
    const left = wasLive.current && !explodeLive;
    wasLive.current = explodeLive;
    const restored = seenRestoreId.current !== restoreId;
    seenRestoreId.current = restoreId;
    if (!left || restored || projection === "iso" || size.width < 2 || size.height < 2) return;
    const oc = orthoControls.current;
    if (!oc) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    const target = oc.target.clone();
    const away = ortho.position.clone().sub(target);
    const reach = Math.max(away.length(), 1);
    if (projection === "plan") {
      flushControlInertia(oc);
      ortho.up.set(0, 0, -1);
      ortho.position.set(target.x, target.y + reach, target.z + 0.01);
      ortho.lookAt(target);
      ortho.up.set(0, 0, -1);
      ortho.updateProjectionMatrix();
      oc.update();
      fittedKeys.plan.current = key;
      return;
    }
    const pc = perspControls.current;
    if (!pc) return;
    const visibleHeight = (ortho.top - ortho.bottom) / ortho.zoom;
    const distance = visibleHeight / 2 / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    flushControlInertia(pc);
    persp.position.copy(target).addScaledVector(away.normalize(), distance);
    pc.target.copy(target);
    persp.lookAt(target);
    persp.updateProjectionMatrix();
    pc.update();
    fittedKeys.persp.current = key;
  }, [explodeLive, restoreId, projection, size.width, size.height, snapId, persp, ortho, perspControls, orthoControls, fittedKeys]);
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
  keepPresetPose = false,
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
  keepPresetPose?: boolean;
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
    if (shouldKeepPresetPose(keepPresetPose, fittedKey.current, touchedRef.current)) {
      fittedKey.current = key;
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
    keepPresetPose,
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
  useFrame((state, delta) => {
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
    state.invalidate();
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

function placeIsoCamera(
  camera: THREE.OrthographicCamera,
  controls: OrbitControlsImpl,
  fitBounds: Aabb,
  clipBounds: Aabb,
  corner: IsoCorner,
  fit: ExplodeFit,
) {
  const centre = frameCentre(fitBounds);
  const eye = isoEye(centre, corner, eyeDistance(fitBounds));
  const planes = orthoNearFar(clipBounds, eye, centre);
  flushControlInertia(controls);
  camera.up.set(ISO_CAMERA_UP[0], ISO_CAMERA_UP[1], ISO_CAMERA_UP[2]);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.near = planes.near;
  camera.far = planes.far;
  camera.zoom = fit.zoom;
  camera.updateProjectionMatrix();
  controls.target.set(centre[0], centre[1], centre[2]);
  camera.lookAt(controls.target);
  camera.up.set(ISO_CAMERA_UP[0], ISO_CAMERA_UP[1], ISO_CAMERA_UP[2]);
  if (fit.shiftXPx !== 0 || fit.shiftYPx !== 0) {
    camera.updateMatrixWorld();
    const shift = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .multiplyScalar(-fit.shiftXPx / fit.zoom)
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), fit.shiftYPx / fit.zoom);
    camera.position.add(shift);
    controls.target.add(shift);
  }
  holdControlPose(controls as HeldControl<THREE.Vector3>);
}

function ExplodeFit({
  camera,
  controlsRef,
  runtime,
  corner,
  snapId,
  active,
  touchedRef,
  fittedKey,
  otherOrthoFittedKey,
  extraBounds,
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  runtime: RefObject<ExplodeRuntime>;
  corner: IsoCorner;
  snapId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
  fittedKey: MutableRefObject<string | null>;
  otherOrthoFittedKey: MutableRefObject<string | null>;
  extraBounds?: Aabb | null;
}) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const fitted = useRef(0);
  useFrame(() => {
    const rt = runtime.current;
    if (!active || rt.fitToken === fitted.current) return;
    const controls = controlsRef.current;
    if (!controls || !rt.bounds || size.width < 2 || size.height < 2) return;
    fitted.current = rt.fitToken;
    placeIsoCamera(
      camera,
      controls,
      rt.bounds,
      extraBounds ? unionAabb(rt.bounds, extraBounds) : rt.bounds,
      corner,
      explodeFitIn(gl.domElement, size, rt.bounds, corner, rt.progress),
    );
    fittedKey.current = `${snapId}:${size.width}x${size.height}`;
    otherOrthoFittedKey.current = null;
    touchedRef.current = false;
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
  explode,
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
  explode?: RefObject<ExplodeRuntime>;
}) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const place = useCallback(() => {
    if (!active) return;
    const controls = controlsRef.current;
    if (!controls || size.width < 2 || size.height < 2) return;
    const bounds = boundsRef.current;
    if (!bounds) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
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
    placeIsoCamera(
      camera,
      controls,
      fitBounds,
      extraBounds ? unionAabb(fitBounds, extraBounds) : fitBounds,
      corner,
      explodeFitIn(gl.domElement, size, fitBounds, corner, explode?.current.progress ?? 0),
    );
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
    explode,
    gl,
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
  frameWidthM,
  frameHeightM,
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
  frameWidthM: number;
  frameHeightM: number;
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
    if (sameSnap) return;
    const measured = boundsRef.current;
    const fitBounds = sitePlanBounds(sideM, groundY, siteTopY, frameWidthM, frameHeightM);
    if (measured) {
      fitBounds.min[0] = Math.max(fitBounds.min[0], measured.min[0]);
      fitBounds.max[0] = Math.min(fitBounds.max[0], measured.max[0]);
      fitBounds.min[2] = Math.max(fitBounds.min[2], measured.min[2]);
      fitBounds.max[2] = Math.min(fitBounds.max[2], measured.max[2]);
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
  }, [
    active,
    camera,
    controlsRef,
    boundsRef,
    extraBounds,
    frameHeightM,
    frameWidthM,
    groundY,
    otherOrthoFittedKey,
    sideM,
    siteTopY,
    snapId,
    size.width,
    size.height,
    touchedRef,
  ]);
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
    gl.domElement.dataset.camBearing = studioCameraHeadingDeg(camera).toFixed(4);
    const dist = camera.position.distanceTo(controls.target);
    gl.domElement.dataset.camDistance = dist.toFixed(4);
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
  touchedRef,
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
  touchedRef: MutableRefObject<boolean>;
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
      touchedRef.current = true;
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
        touchedRef.current = true;
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
    touchedRef,
  ]);
  return null;
}

function ExportBridge({
  onExportReady,
  solarDiagramOn,
  landmarkLabelsRef,
}: {
  onExportReady: (exporter: SceneExporter | null) => void;
  solarDiagramOn: boolean;
  landmarkLabelsRef?: RefObject<LandmarkExportLabels | null>;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  useLayoutEffect(() => {
    onExportReady({
      png: async () => {
        const city = scene.getObjectByName("CityCut");
        const render = () =>
          captureViewPng(gl, scene, get().camera, exportFrameSize(gl.domElement), landmarkLabelsRef?.current ?? null);
        if (city && solarDiagramOn) return withBuildingExportColours(city, false, render);
        return render();
      },
      viewportPng: (options) => captureViewportPng(gl, scene, get().camera, readViewportCapture(gl.domElement), options),
      sheetFrame: (crop) => {
        const canvas = gl.domElement;
        const cssWidth = canvas.clientWidth || canvas.width;
        const cssHeight = canvas.clientHeight || canvas.height;
        const free = readViewportCapture(canvas).crop ?? { x: 0, y: 0, width: cssWidth, height: cssHeight };
        const rect = sheetCropRect({ width: cssWidth, height: cssHeight }, free, crop.aspect);
        return planSheetFrame(get().camera, cssHeight, rect.width);
      },
      shot: () => {
        const frame = exportFrameSize(gl.domElement);
        return shotFromCamera(cameraForExportFrame(get().camera, frame.width, frame.height), frame.width, frame.height);
      },
    });
    return () => onExportReady(null);
  }, [gl, scene, get, onExportReady, solarDiagramOn, landmarkLabelsRef]);
  return null;
}

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
  });
  return null;
}

function CameraRestoreBridge({
  restore,
  onRestored,
  snapId,
  projection,
  persp,
  ortho,
  perspControls,
  orthoControls,
  fittedKeys,
  touchedRef,
}: {
  restore: CameraRestoreRequest | null | undefined;
  onRestored: ((id: number) => void) | undefined;
  snapId: number;
  projection: ProjectionMode;
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
  const invalidate = useThree((state) => state.invalidate);
  const handledId = useRef(0);
  useFrame(() => {
    if (!restore || !onRestored || handledId.current === restore.id) return;
    if (restore.projection !== projection) {
      handledId.current = restore.id;
      onRestored(restore.id);
      return;
    }
    const fitKey = projection === "perspective" ? fittedKeys.persp : projection === "iso" ? fittedKeys.iso : fittedKeys.plan;
    if (!fitKey.current?.startsWith(`${snapId}:`)) return;
    const controls = projection === "perspective" ? perspControls.current : orthoControls.current;
    if (!controls) return;
    flushControlInertia(controls);
    applyPose(projection === "perspective" ? persp : ortho, controls, restore.pose);
    holdControlPose(controls as HeldControl<THREE.Vector3>);
    touchedRef.current = true;
    handledId.current = restore.id;
    invalidate();
    onRestored(restore.id);
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
  cameraRestore,
  onCameraRestored,
  introEnabled = false,
  gizmoOrbitLock = false,
  frameWidthM,
  frameHeightM,
  landmarkLabelsRef,
  explode,
  explodeLive = false,
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
  cameraRestore?: CameraRestoreRequest | null;
  onCameraRestored?: (id: number) => void;
  introEnabled?: boolean;
  gizmoOrbitLock?: boolean;
  frameWidthM: number;
  frameHeightM: number;
  landmarkLabelsRef?: RefObject<LandmarkExportLabels | null>;
  explode?: RefObject<ExplodeRuntime>;
  explodeLive?: boolean;
}) {
  const orthoBoundsRef = useMemo<RefObject<Aabb | null>>(
    () => ({
      get current() {
        const rt = explode?.current;
        return rt && rt.progress > 0 && rt.bounds ? rt.bounds : boundsRef.current;
      },
    }),
    [explode, boundsRef],
  );
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
  const invalidate = useThree((state) => state.invalidate);
  const onControlsChange = useCallback(() => {
    invalidate();
  }, [invalidate]);

  return (
    <>
      <perspectiveCamera ref={perspRef} fov={32} />
      <orthographicCamera ref={orthoRef} />
      {ready && persp && ortho && (
        <>
          <BindCamera camera={orthoView ? ortho : persp} />
          <FrameCameras persp={persp} ortho={ortho} />
          <ExplodeHandoff
            explodeLive={explodeLive}
            restoreId={cameraRestore?.id ?? 0}
            projection={projection}
            persp={persp}
            ortho={ortho}
            perspControls={perspControls}
            orthoControls={orthoControls}
            snapId={snapId}
            fittedKeys={fittedKeys}
          />
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
            active={!orthoView}
            touchedRef={touchedRef}
            fittedKey={perspFitKey}
            introEnabled={introEnabled}
            keepPresetPose={qaMode}
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
            touchedRef={touchedRef}
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
            boundsRef={orthoBoundsRef}
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
            explode={explode}
          />
          {explode ? (
            <ExplodeFit
              camera={ortho}
              controlsRef={orthoControls}
              runtime={explode}
              corner={corner}
              snapId={snapId}
              active={iso}
              touchedRef={touchedRef}
              fittedKey={isoFitKey}
              otherOrthoFittedKey={planFitKey}
              extraBounds={heliodonClipBounds}
            />
          ) : null}
          <PlanSnap
            camera={ortho}
            controlsRef={orthoControls}
            boundsRef={boundsRef}
            sideM={side}
            frameWidthM={frameWidthM}
            frameHeightM={frameHeightM}
            groundY={groundY}
            siteTopY={siteTopY}
            snapId={snapId}
            active={plan}
            touchedRef={touchedRef}
            fittedKey={planFitKey}
            otherOrthoFittedKey={isoFitKey}
            extraBounds={heliodonClipBounds}
          />
          <OrthoClip camera={ortho} controlsRef={orthoControls} boundsRef={orthoBoundsRef}
            active={orthoView}
            extraBounds={heliodonClipBounds}
          />
          <OrbitControls
            ref={perspControls}
            camera={persp}
            makeDefault={!orthoView}
            enabled={!orthoView && !gizmoOrbitLock}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.02}
            minDistance={side * 0.2}
            maxDistance={Math.max(side * 6, heliodonRadius * 2.4)}
            onStart={() => {
              touchedRef.current = true;
            }}
            onChange={onControlsChange}
          />
          <OrbitControls
            ref={orthoControls}
            camera={ortho}
            makeDefault={orthoView}
            enabled={orthoView && !gizmoOrbitLock}
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
            onChange={onControlsChange}
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
          <CameraRestoreBridge
            restore={cameraRestore}
            onRestored={onCameraRestored}
            snapId={snapId}
            projection={projection}
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
          <ExportBridge onExportReady={onExportReady} solarDiagramOn={solarDiagramOn} landmarkLabelsRef={landmarkLabelsRef} />
        </>
      )}
    </>
  );
}

function WindLayer({
  model,
  siteWind,
  period,
  designWind,
  sector,
  enabled,
  animateStreaks,
}: {
  model: CityModel;
  siteWind: SiteWindSelection | null;
  period: WindPeriodId;
  designWind: DesignWind | null;
  sector: number | null;
  enabled: boolean;
  animateStreaks: boolean;
}) {
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && !document.hidden);
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!enabled) return null;
  const seasonStats = siteWind ? analyzeSiteWind(siteWind, period) : null;
  const stats = seasonStats ? headingPeriodStats(seasonStats, designWind, sector) : null;
  return (
    <GroundWindFlow model={model} stats={stats} animate={visible && animateStreaks} />
  );
}

export function Scene3D({
  model,
  windModel,
  windPlanOutlineModel,
  uniformBuildings,
  colourBySource,
  showManualEdits,
  projection: chosenProjection,
  corner,
  freeRotate,
  snapId,
  solar,
  windEnabled,
  siteWind,
  windPeriod,
  windDesignWind = null,
  windSector = null,
  windAnimateStreaks,
  windDiagramStreams = null,
  windSpreadRadiusM = null,
  sunDomeRadiusM,
  windPlan = null,
  onExportReady,
  onSceneInspectPick,
  onClearSceneInspect,
  inspectAnchor,
  onInspectHudScreen,
  heightEditBuildingId,
  selectedBuildingIds,
  cameraMemory,
  cameraRestore,
  onCameraRestored,
  display,
  importedMassing = null,
  walkLayer = null,
  walkRippleLayer = null,
  walkRippleTint = null,
  walkRippleArrivals = null,
  walkRipplePlaying = false,
  onScenePoint = null,
  sectionKnife = null,
  onSectionKnifePoseChange = undefined,
  onCompassHeading = undefined,
  quality = "high",
  sunHoursGroundGrid = null,
  sunHoursDirectOverlay = null,
  sunHoursScaleMax = 0,
  solarAnalysisActive = false,
  introPlayed,
  active = true,
  landmarkSources = NO_LANDMARKS,
  landmarkLabelsOn = false,
  onLandmarkScreens,
  exploded = false,
  explodeGapM = 0,
  inspectAnchorLayer = "ground",
}: {
  model: CityModel;
  windModel?: CityModel;
  windPlanOutlineModel?: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  showManualEdits: boolean;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
  solar: SolarViewSettings;
  windEnabled: boolean;
  siteWind: SiteWindSelection | null;
  windPeriod: WindPeriodId;
  windDesignWind?: DesignWind | null;
  windSector?: number | null;
  windAnimateStreaks: boolean;
  windDiagramStreams?: readonly PrevailingStream[] | null;
  windSpreadRadiusM?: number | null;
  sunDomeRadiusM?: number;
  windPlan?: WindPlanState | null;
  onExportReady: (exporter: SceneExporter | null) => void;
  onSceneInspectPick: (selection: SceneSelection) => void;
  onClearSceneInspect?: () => void;
  inspectAnchor: SceneInspectWorld | null;
  onInspectHudScreen: (screen: InspectHudScreen | null) => void;
  heightEditBuildingId: number | null;
  selectedBuildingIds?: readonly number[];
  cameraMemory?: CameraMemoryRef;
  cameraRestore?: CameraRestoreRequest | null;
  onCameraRestored?: (id: number) => void;
  display: View3dDisplaySettings;
  importedMassing?: THREE.Object3D | null;
  walkLayer?: THREE.Object3D | null;
  walkRippleLayer?: THREE.Object3D | null;
  walkRippleTint?: WalkRippleBuildingTint | null;
  walkRippleArrivals?: Map<number, number> | null;
  walkRipplePlaying?: boolean;
  onScenePoint?: ((east: number, north: number, up: number) => void) | null;
  sectionKnife?: SectionKnifeToolState | null;
  onSectionKnifePoseChange?: (pose: SectionKnifePose) => void;
  onCompassHeading?: (deg: number) => void;
  quality?: RenderQuality;
  sunHoursGroundGrid?: SunHoursGroundGrid | null;
  sunHoursDirectOverlay?: SunHoursDirectOverlay | null;
  sunHoursScaleMax?: number;
  solarAnalysisActive?: boolean;
  introPlayed?: { current: string | null };
  active?: boolean;
  landmarkSources?: readonly LandmarkLabelSource[];
  landmarkLabelsOn?: boolean;
  onLandmarkScreens?: (state: LandmarkScreenState | null) => void;
  exploded?: boolean;
  explodeGapM?: number;
  inspectAnchorLayer?: ExplodeLayerId;
}) {
  const explodeRuntime = useMemo<RefObject<ExplodeRuntime>>(() => ({ current: createExplodeRuntime() }), []);
  const explodeOverlayRef = useRef<THREE.Group | null>(null);
  const explodeLabelsRef = useRef<Partial<Record<ExplodeLayerId, HTMLElement | null>>>({});
  const explodeLeadersRef = useRef<Partial<Record<ExplodeLayerId, SVGLineElement | null>>>({});
  const { explodeLive, onExplodeCollapsed } = useExplodeLive(exploded, cameraRestore?.id ?? 0);
  const projection: ProjectionMode = explodeLive ? "iso" : chosenProjection;
  const [explodeTopLiftM, setExplodeTopLiftM] = useState(0);
  const pickLifts = useRef(new WeakMap<SceneInspectWorld, number>());
  const onInspectPick = useCallback(
    (selection: SceneSelection) => {
      pickLifts.current.set(selection.world, explodeRuntime.current.offsets[explodeLayerOfSelectionKind(selection.kind)]);
      onSceneInspectPick(selection);
    },
    [explodeRuntime, onSceneInspectPick],
  );
  const inspectLift = useCallback(
    () =>
      inspectAnchor
        ? explodeRuntime.current.offsets[inspectAnchorLayer] - (pickLifts.current.get(inspectAnchor) ?? 0)
        : 0,
    [explodeRuntime, inspectAnchor, inspectAnchorLayer],
  );
  const landmarkExportRef = useRef<LandmarkExportLabels | null>(null);
  const sceneCutKey = modelCutSiteId(model.center, model.sideM);
  const introSkip = useMemo(
    () => introAlreadyPlayedForCut(introPlayed?.current ?? null, sceneCutKey),
    [introPlayed, sceneCutKey],
  );
  const boundsRef = useRef<Aabb | null>(null);
  const windPlanStore = useMemo(() => createWindPlanTransformStore(), []);
  const windPlanOn = windPlan?.active === true;
  const windDiagramOn = windDiagramStreams != null && windDiagramStreams.length > 0;
  const onBounds = useCallback((bounds: Aabb) => {
    boundsRef.current = bounds;
    if (typeof document === "undefined") return;
    const canvas = document.querySelector(".scene-viewport canvas");
    if (!(canvas instanceof HTMLElement)) return;
    const spanX = bounds.max[0] - bounds.min[0];
    const spanZ = bounds.max[2] - bounds.min[2];
    canvas.dataset.citycutGroundSpanX = spanX.toFixed(3);
    canvas.dataset.citycutGroundSpanZ = spanZ.toFixed(3);
  }, []);
  const [sectionKnifeGizmoInteraction, setSectionKnifeGizmoInteraction] = useState<SectionKnifeGizmoInteraction>(
    () => idleSectionKnifeGizmoInteraction,
  );
  const onSectionKnifeGizmoInteractionChange = useCallback((state: SectionKnifeGizmoInteraction) => {
    setSectionKnifeGizmoInteraction(state);
  }, []);
  const lift = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
  const colourTick = useColourRevision();
  const modelBg = useMemo(() => themeColor("--model-bg"), [colourTick]);
  const sky = getColour("--light-sky");
  const groundLight = getColour("--light-ground");
  const studioFill = getColour("--light-fill");
  const groundY = model.terrain ? model.terrain.min : 0;
  const plinthBottomY = basePlinthBottomY(model.sideM, model.terrain);
  const cutFrame = useMemo(
    () => siteFrameFromModel(model),
    [model.sideM, model.widthM, model.heightM, model.frameShape],
  );
  const solarNeutralFill = useMemo(() => getColour("--building-solar-neutral"), [colourTick]);
  const sunSample = useMelbourneSunSample(model.center.lat, model.center.lon, solar);
  const sunHoursPickedOnly = Boolean(solar.sunHours && solar.sunHoursPickedOnly);
  const sunHoursPickedKey = (selectedBuildingIds ?? []).join(",");
  const sunHoursFaces = useMemo(() => {
    if (!sunHoursDirectOverlay || !sunHoursPickedOnly) return sunHoursDirectOverlay;
    const pickedIds = sunHoursPickedKey === "" ? [] : sunHoursPickedKey.split(",").map(Number);
    return sunHoursOverlayForBuildings(sunHoursDirectOverlay, pickedIds);
  }, [sunHoursDirectOverlay, sunHoursPickedOnly, sunHoursPickedKey]);
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
  const { fillKeyLight, fillAmbient, fillHemi, sunIntensity, noToneMapping } = studioSceneLighting({
    primaryView: display.primaryView,
    showPath: solar.showPath,
    castShadows: solar.castShadows,
    solarAnalysisActive,
    sunAboveHorizon: sunSample.aboveHorizon,
  });
  const solarShadowsActive = solarAnalysisActive && solar.castShadows && sunSample.aboveHorizon;
  const heliodonRadius = heliodonRadiusM(model.sideM, solar.radiusFactor);
  const shadowTargetY = groundY;
  const siteTopY = useMemo(() => {
    let top = model.terrain ? model.terrain.max : 0;
    const base = model.terrain ? model.terrain.max : 0;
    for (const building of model.buildings) top = Math.max(top, base + building.height);
    return top;
  }, [model]);
  const gizmoCursorClass =
    sectionKnifeGizmoInteraction.cursor === "grabbing"
      ? " section-knife-gizmo-grabbing"
      : sectionKnifeGizmoInteraction.cursor === "grab"
        ? " section-knife-gizmo-grab"
        : "";
  return (
    <div className={`scene-viewport${gizmoCursorClass}`}>
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
        dpr={[1, 1.5]}
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
        <SceneDemandBootstrap />
        <SceneFrameloopGate introSkip={introSkip} />
        <ScenePause active={active} />
        <AdaptiveViewportDpr />
        <SceneContinuousBridge
          windAnimate={(windEnabled || windDiagramOn) && windAnimateStreaks && !windPlanOn}
          walkRippleActive={walkRipplePlaying}
        />
        {qaModeFromSearch(typeof window === "undefined" ? "" : window.location.search) ? <QaPerfSampler /> : null}
        <RendererShadows enabled={solar.castShadows} />
      <SunStudyToneMapping noToneMapping={noToneMapping} />
      <StudioSky colourTick={colourTick} fallback={modelBg} />
      <hemisphereLight args={[sky, groundLight, fillHemi]} />
      <ambientLight intensity={fillAmbient} />
      <directionalLight position={[model.sideM * 0.4, model.sideM, model.sideM * 0.2]} intensity={fillKeyLight} />
      <directionalLight
        position={[-model.sideM * 0.6, model.sideM * 0.45, -model.sideM * 0.5]}
        color={studioFill}
        intensity={fillKeyLight * STUDIO_FILL_RATIO}
      />
      <StudioEffects
        quality={quality}
        noToneMapping={noToneMapping}
        sideM={model.sideM}
        plinthBottomY={plinthBottomY}
        showShadow={projection !== "plan"}
        frame={cutFrame}
        colourTick={colourTick}
        primaryView={display.primaryView}
      />
      <SolarLight
        sample={sunSample}
        sideM={Math.max(model.sideM, heliodonRadius * 0.5)}
        enabled={solar.castShadows}
        intensity={sunIntensity}
        targetY={shadowTargetY}
        topY={siteTopY + explodeTopLiftM}
      />
      {sunHoursGroundShown(Boolean(solar.sunHours), sunHoursPickedOnly) && sunHoursGroundGrid ? (
        <SunHoursLayer
          grid={sunHoursGroundGrid}
          overlay={null}
          scaleMaxHours={sunHoursScaleMax || sunHoursGroundGrid.maxSunHours}
          model={model}
          planView={projection === "plan"}
          groundOnly
        />
      ) : null}
      <City
        model={model}
        uniformBuildings={uniformBuildings}
        colourBySource={colourBySource}
        highlightManual={showManualEdits && model.manualHeightEditCount !== undefined && model.manualHeightEditCount > 0}
        solarDiagramOn={solar.showPath}
        directSunHoursOn={Boolean(solar.sunHours && sunHoursDirectOverlay)}
        sunHoursPickedOnly={sunHoursPickedOnly}
        solarNeutralFill={solarNeutralFill}
        solarGreyscale={monoViewActive(display)}
        solarShadowsActive={solarShadowsActive}
        onBounds={onBounds}
        onSceneInspectPick={onInspectPick}
        onClearSceneInspect={onClearSceneInspect}
        pickBuildings={model.layers.buildings && !onScenePoint}
        onScenePoint={onScenePoint}
        heightEditBuildingId={heightEditBuildingId}
        selectedBuildingIds={selectedBuildingIds}
        display={display}
        sectionKnife={sectionKnife}
        onSectionKnifePoseChange={onSectionKnifePoseChange}
        onSectionKnifeGizmoInteractionChange={onSectionKnifeGizmoInteractionChange}
        projection={projection}
        walkRippleTint={walkRippleTint}
        walkRippleArrivals={walkRippleArrivals}
        windFlowActive={windEnabled}
        introSkip={introSkip}
        introPlayed={introPlayed}
        importedMassing={importedMassing}
        exploded={exploded}
        explodeGapM={explodeGapM}
        explodeRuntime={explodeRuntime}
        explodeOverlayRef={explodeOverlayRef}
        cityBoundsRef={boundsRef}
        onExplodeCollapsed={onExplodeCollapsed}
        explodeSnapKey={cameraRestore?.id ?? 0}
        onExplodeTopLift={setExplodeTopLiftM}
      />
      <group ref={explodeOverlayRef}>
        {solar.sunHours && sunHoursGroundGrid && sunHoursFaces ? (
          <SunHoursLayer
            grid={sunHoursGroundGrid}
            overlay={sunHoursFaces}
            scaleMaxHours={sunHoursScaleMax || sunHoursGroundGrid.maxSunHours}
            model={model}
            planView={projection === "plan"}
            surfacesOnly
          />
        ) : null}
        {importedMassing ? <primitive object={importedMassing} /> : null}
      </group>
      {walkLayer ? <primitive object={walkLayer} /> : null}
      {walkRippleLayer ? <primitive object={walkRippleLayer} /> : null}
      {onScenePoint ? <ScenePointLayer onScenePoint={onScenePoint} /> : null}
      <SolarHeliodon
        lat={model.center.lat}
        lon={model.center.lon}
        sideM={model.sideM}
        groundY={groundY}
        terrain={model.terrain ?? undefined}
        settings={solar}
        radiusM={sunDomeRadiusM}
      />
      <InspectHudProjector
        world={inspectAnchor}
        enabled={inspectAnchor != null}
        onScreen={onInspectHudScreen}
        lift={inspectLift}
      />
      {onLandmarkScreens ? (
        <LandmarkLabelProjector
          sources={landmarkSources}
          enabled={landmarkLabelsOn && active && !explodeLive}
          onScreens={onLandmarkScreens}
          exportRef={landmarkExportRef}
        />
      ) : null}
      {onCompassHeading ? <StudioCompassTracker onHeading={onCompassHeading} /> : null}
      <WindLayer
        model={windModel ?? model}
        siteWind={siteWind}
        period={windPeriod}
        designWind={windDesignWind}
        sector={windSector}
        enabled={windEnabled && !windPlanOn}
        animateStreaks={windAnimateStreaks}
      />
      {windDiagramOn && !windPlanOn ? (
        <WindDiagramStreams model={windModel ?? model} streams={windDiagramStreams ?? []} spreadRadiusM={windSpreadRadiusM} animate={active && windAnimateStreaks} />
      ) : null}
      {windPlanOn ? <WindPlanProjector store={windPlanStore} /> : null}
      <Cameras
        side={model.sideM}
        frameWidthM={model.widthM ?? model.sideM}
        frameHeightM={model.heightM ?? model.sideM}
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
        cameraRestore={cameraRestore}
        onCameraRestored={onCameraRestored}
        introEnabled={!introSkip}
        gizmoOrbitLock={sectionKnifeGizmoInteraction.orbitLock}
        landmarkLabelsRef={landmarkExportRef}
        explode={explodeRuntime}
        explodeLive={explodeLive}
      />
      {explodeLive ? (
        <ExplodeLabelProjector
          runtime={explodeRuntime}
          exploding={exploded}
          shown={active}
          frame={cutFrame}
          labelsRef={explodeLabelsRef}
          leadersRef={explodeLeadersRef}
        />
      ) : null}
      </Canvas>
      {explodeLive && active ? (
        <div className="explode-label-layer">
          <svg className="explode-leader-layer" aria-hidden="true">
            {EXPLODE_LAYERS.map((layer) => (
              <line
                key={layer}
                className="explode-leader"
                ref={(element) => {
                  explodeLeadersRef.current[layer] = element;
                }}
              />
            ))}
          </svg>
          {EXPLODE_LAYERS.map((layer) => (
            <div
              key={layer}
              className="explode-layer-label"
              data-explode-layer={layer}
              ref={(element) => {
                explodeLabelsRef.current[layer] = element;
              }}
            >
              {EXPLODE_LAYER_LABELS[layer]}
            </div>
          ))}
        </div>
      ) : null}
      {windPlanOn && windPlan ? <WindPlanOverlay model={windPlanOutlineModel ?? model} plan={windPlan} store={windPlanStore} /> : null}
    </div>
  );
}
