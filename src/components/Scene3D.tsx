import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { addBuildingEdges } from "../lib/buildingEdges";
import { attachBuildingPick } from "../lib/buildingPick";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
import { auditBuildingSelection, mountSelectedBuildingVisual } from "../lib/buildingSelectionVisual";
import { CAMERA_FIT_INCLUDES_HELIODON } from "../lib/sceneCameraFit";
import { shotFromCamera, type CameraShot } from "../lib/cameraShot";
import { getColour } from "../lib/colours";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import { captureViewPng } from "../lib/capturePng";
import { flushControlInertia, holdControlPose, type HeldControl } from "../lib/controlInertia";
import {
  applyBuildingSolarNeutral,
  snapshotBuildingViewportColors,
  withBuildingExportColours,
  type BuildingColourMode,
} from "../lib/buildingViewportColor";
import {
  applySunStudySurfaceTint,
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
import { SolarHeliodon, SolarLight, useMelbourneSunSample, type SolarViewSettings } from "./SolarHeliodon";
import { WindStaticArrows, WindStreaks } from "./WindStreaks";
import { analyzeWindPeriod, type WindPeriodId, type WindRoseTable } from "../lib/windRose";
import type { CityModel } from "../types";

export type SceneExporter = {
  png: () => Promise<Blob>;
  shot: () => CameraShot;
};

type FiberCamera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean };

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
  onBuildingPick: (buildingId: number, clientX: number, clientY: number) => void;
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

function HeightEditOverlayLayer({
  model,
  buildingId,
  cityRoot,
  colourMode,
}: {
  model: CityModel;
  buildingId: number | null;
  cityRoot: THREE.Object3D;
  colourMode: BuildingColourMode;
}) {
  const [overlay, setOverlay] = useState<THREE.Group | null>(null);
  useLayoutEffect(() => {
    if (buildingId == null) {
      setOverlay(null);
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      return;
    }
    const mounted = mountSelectedBuildingVisual(cityRoot, model, buildingId, colourMode);
    if (!mounted) {
      setOverlay(null);
      if (typeof window !== "undefined") delete window.__citycutQaSelectionAudit;
      return;
    }
    setOverlay(mounted.overlay);
    if (typeof window !== "undefined" && qaModeFromSearch(window.location.search)) {
      const publishAudit = () => {
        window.__citycutQaSelectionAudit = auditBuildingSelection(cityRoot, buildingId, mounted.overlay);
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
  }, [buildingId, cityRoot, colourMode, model]);
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
  onBounds: (bounds: Aabb) => void;
  onBuildingPick: (buildingId: number, clientX: number, clientY: number) => void;
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
    const city = buildCityGroup(model, { uniformBuildings, colourBySource, highlightManual });
    const ground = city.getObjectByName("Ground");
    if (ground && ground instanceof THREE.Mesh && ground.name === "Ground") {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(ground.geometry),
        new THREE.LineBasicMaterial({ color: getColour("--ground-edge") }),
      );
      edges.position.copy(ground.position);
      edges.name = "GroundEdge";
      city.add(edges);
    }
    addBuildingEdges(city);
    return city;
  }, [model, uniformBuildings, colourBySource, highlightManual, colourTick]);
  useLayoutEffect(() => {
    onBoundsRef.current(measureCity(group));
  }, [group]);
  useLayoutEffect(() => {
    snapshotBuildingViewportColors(group, colourMode);
    snapshotSunStudySurfaceColors(group);
  }, [group, colourMode]);
  useLayoutEffect(() => {
    applySunStudySurfaceTint(group, solarDiagramOn);
    applyBuildingSolarNeutral(group, solarDiagramOn, solarNeutralFill);
  }, [group, solarDiagramOn, solarNeutralFill, colourTick]);
  useLayoutEffect(() => () => disposeObject(group), [group]);
  return (
    <>
      <primitive object={group} />
      <HeightEditOverlayLayer
        model={model}
        buildingId={heightEditBuildingId}
        cityRoot={group}
        colourMode={colourMode}
      />
      <BuildingPickLayer
        root={group}
        enabled={pickBuildings}
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
}) {
  const size = useThree((state) => state.size);
  const fittedKey = useRef<string | null>(null);
  const place = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || !active || size.width < 2 || size.height < 2) return;
    const key = `${fitId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;

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
    flushControlInertia(controls);
    camera.position.set(pose.eye[0], pose.eye[1], pose.eye[2]);
    camera.near = pose.near;
    camera.far = pose.far;
    controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    fittedKey.current = key;
  }, [active, camera, controlsRef, fitId, groundY, lift, side, siteTopY, size.height, size.width]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useFrame(() => {
    place();
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
  sideM,
  groundY,
  siteTopY,
  heliodonRadius,
  solar,
  lat,
  lon,
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  corner: IsoCorner;
  snapId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
  sideM: number;
  groundY: number;
  siteTopY: number;
  heliodonRadius: number;
  solar: SolarViewSettings;
  lat: number;
  lon: number;
}) {
  const size = useThree((state) => state.size);
  const fittedKey = useRef<string | null>(null);
  const place = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || size.width < 2 || size.height < 2) return;
    const bounds = boundsRef.current;
    if (!bounds) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
    if (sameSnap && touchedRef.current) return;
    if (!active && fittedKey.current !== null && !sameSnap) return;
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
    const planes = orthoNearFar(fitBounds, eye, centre);
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
    touchedRef.current = false;
  }, [
    active,
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
}) {
  const size = useThree((state) => state.size);
  const fittedKey = useRef<string | null>(null);
  const place = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || size.width < 2 || size.height < 2) return;
    const key = `${snapId}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
    if (sameSnap && touchedRef.current) return;
    if (!active && fittedKey.current !== null && !sameSnap) return;
    const measured = boundsRef.current;
    const fitBounds = sitePlanBounds(sideM, groundY, siteTopY);
    if (measured) {
      fitBounds.min[1] = Math.min(fitBounds.min[1], measured.min[1]);
      fitBounds.max[1] = Math.max(fitBounds.max[1], measured.max[1]);
    }
    const centre = frameCentre(fitBounds);
    const distance = planEyeDistance(fitBounds);
    const eye = planEye(centre, distance);
    const planes = planNearFar(fitBounds, centre);
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
    touchedRef.current = false;
  }, [active, camera, controlsRef, boundsRef, groundY, sideM, siteTopY, snapId, size.width, size.height, touchedRef]);
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
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  active: boolean;
}) {
  useFrame(() => {
    if (!active) return;
    const controls = controlsRef.current;
    const bounds = boundsRef.current;
    if (!controls || !bounds) return;
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
        const render = () => captureViewPng(gl, scene, get().camera);
        if (city && solarDiagramOn) return withBuildingExportColours(city, true, render);
        return render();
      },
      shot: () => shotFromCamera(get().camera, gl.domElement.clientWidth, gl.domElement.clientHeight),
    });
    return () => onExportReady(null);
  }, [gl, scene, get, onExportReady, solarDiagramOn]);
  return null;
}

function Cameras({
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
}) {
  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const perspControls = useRef<OrbitControlsImpl | null>(null);
  const orthoControls = useRef<OrbitControlsImpl | null>(null);
  const touchedRef = useRef(false);
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
            active={iso && !freeRotate}
            touchedRef={touchedRef}
            sideM={side}
            groundY={groundY}
            siteTopY={siteTopY}
            heliodonRadius={heliodonRadius}
            solar={solar}
            lat={lat}
            lon={lon}
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
          />
          <OrthoClip camera={ortho} controlsRef={orthoControls} boundsRef={boundsRef} active={orthoView} />
          <OrbitControls
            ref={perspControls}
            camera={persp}
            makeDefault={!orthoView}
            enabled={!orthoView}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.02}
            minDistance={side * 0.2}
            maxDistance={Math.max(side * 3.4, heliodonRadius * 2.4)}
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
  onBuildingPick: (buildingId: number, clientX: number, clientY: number) => void;
  onClearBuildingPick?: () => void;
  heightEditBuildingId: number | null;
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
    showPath: solar.showPath,
    castShadows: solar.castShadows,
  });
  const { fillKeyLight, fillAmbient, fillHemi, sunIntensity, noToneMapping } = viewportLight;
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
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: qaModeFromSearch(window.location.search),
        }}
        shadows={solar.castShadows}
      >
        <WebGlContextWatch onContextLost={onGlContextLost} onContextRestored={onGlContextRestored} />
        <RendererShadows enabled={solar.castShadows} />
      <SunStudyToneMapping noToneMapping={noToneMapping} />
      <color attach="background" args={[modelBg]} />
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
        pickBuildings={model.layers.buildings}
        heightEditBuildingId={heightEditBuildingId}
      />
      <SolarHeliodon
        lat={model.center.lat}
        lon={model.center.lon}
        sideM={model.sideM}
        groundY={groundY}
        terrain={model.terrain ?? undefined}
        settings={solar}
        hideDiagram={projection === "plan"}
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
      />
      </Canvas>
    </div>
  );
}
