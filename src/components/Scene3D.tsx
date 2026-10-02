import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { addBuildingEdges } from "../lib/buildingEdges";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
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
import type { ProjectionMode } from "../lib/viewMemory";
import {
  DEFAULT_PERSPECTIVE_OFFSET,
  defaultPerspectiveDistance,
  defaultPerspectiveTarget,
  heliodonSceneBounds,
  perspectiveFitDistance,
  unionAabb,
} from "../lib/heliodonFraming";
import { heliodonRadiusM } from "../lib/heliodonRadius";
import { SolarHeliodon, SolarLight, useMelbourneSunSample, type SolarViewSettings } from "./SolarHeliodon";
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

function City({
  model,
  uniformBuildings,
  colourBySource,
  solarDiagramOn,
  solarNeutralFill,
  onBounds,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  solarDiagramOn: boolean;
  solarNeutralFill: string;
  onBounds: (bounds: Aabb) => void;
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
    const city = buildCityGroup(model, { uniformBuildings, colourBySource });
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
  }, [model, uniformBuildings, colourBySource, colourTick]);
  useLayoutEffect(() => {
    onBoundsRef.current(measureCity(group));
  }, [group]);
  useLayoutEffect(() => {
    snapshotBuildingViewportColors(group, colourMode);
  }, [group, colourMode]);
  useLayoutEffect(() => {
    applyBuildingSolarNeutral(group, solarDiagramOn, solarNeutralFill);
  }, [group, solarDiagramOn, solarNeutralFill, colourTick]);
  useLayoutEffect(() => () => disposeObject(group), [group]);
  return <primitive object={group} />;
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
    const solarKey = solar.showPath
      ? `${solar.radiusFactor}:${solar.month}-${solar.day}:${solar.hour}:${solar.minute}`
      : "off";
    const key = `${fitId}:${solar.showPath}:${solarKey}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;

    let target: [number, number, number];
    let distance: number;
    if (solar.showPath) {
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
      target = frameCentre(bounds);
      distance =
        perspectiveFitDistance(
          bounds,
          target,
          DEFAULT_PERSPECTIVE_OFFSET,
          camera.fov,
          size.width / Math.max(size.height, 1),
        ) * (1 + Math.max(0, solar.radiusFactor - 1) * 0.08);
    } else {
      target = defaultPerspectiveTarget(side, lift);
      distance = defaultPerspectiveDistance(side);
    }

    const eye = [
      target[0] + DEFAULT_PERSPECTIVE_OFFSET[0] * distance,
      target[1] + DEFAULT_PERSPECTIVE_OFFSET[1] * distance,
      target[2] + DEFAULT_PERSPECTIVE_OFFSET[2] * distance,
    ] as const;
    flushControlInertia(controls);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.near = Math.max(0.1, side / 400);
    camera.far = Math.max(side * 40, heliodonRadius * 28, distance * 2.5);
    controls.target.set(target[0], target[1], target[2]);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    fittedKey.current = key;
  }, [
    active,
    camera,
    controlsRef,
    fitId,
    groundY,
    heliodonRadius,
    lat,
    lift,
    lon,
    side,
    siteTopY,
    size.height,
    size.width,
    solar,
  ]);
  useLayoutEffect(() => {
    place();
  }, [place]);
  useFrame(() => {
    place();
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
    const key = `${snapId}:${solar.showPath ? "sun" : "nosun"}:${size.width}x${size.height}`;
    if (fittedKey.current === key) return;
    const sameSnap = fittedKey.current?.startsWith(`${snapId}:`) ?? false;
    if (sameSnap && touchedRef.current) return;
    if (!active && fittedKey.current !== null && !sameSnap) return;
    let fitBounds = bounds;
    if (solar.showPath) {
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
            active={!orthoView}
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

export function Scene3D({
  model,
  uniformBuildings,
  colourBySource,
  projection,
  corner,
  freeRotate,
  snapId,
  solar,
  onExportReady,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
  solar: SolarViewSettings;
  onExportReady: (exporter: SceneExporter | null) => void;
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
  const fillKeyLight = solar.castShadows ? 0 : 1.35;
  const fillAmbient = solar.castShadows ? 0.08 : 0.28;
  const fillHemi = solar.castShadows ? 0.34 : 0.7;
  const heliodonRadius = heliodonRadiusM(model.sideM, solar.radiusFactor);
  const shadowTargetY = groundY;
  const siteTopY = useMemo(() => {
    let top = model.terrain ? model.terrain.max : 0;
    const base = model.terrain ? model.terrain.max : 0;
    for (const building of model.buildings) top = Math.max(top, base + building.height);
    return top;
  }, [model]);
  return (
    <Canvas
      key={glEpoch}
      className="scene-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      shadows={solar.castShadows}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        const onLost = (event: Event) => {
          event.preventDefault();
        };
        const onRestored = () => setGlEpoch((value) => value + 1);
        canvas.addEventListener("webglcontextlost", onLost);
        canvas.addEventListener("webglcontextrestored", onRestored);
      }}
    >
      <RendererShadows enabled={solar.castShadows} />
      <color attach="background" args={[modelBg]} />
      <hemisphereLight args={[sky, groundLight, fillHemi]} />
      <ambientLight intensity={fillAmbient} />
      <directionalLight position={[model.sideM * 0.4, model.sideM, model.sideM * 0.2]} intensity={fillKeyLight} />
      <SolarLight
        sample={sunSample}
        sideM={Math.max(model.sideM, heliodonRadius * 0.5)}
        enabled={solar.castShadows}
        targetY={shadowTargetY}
        topY={siteTopY}
      />
      <City
        model={model}
        uniformBuildings={uniformBuildings}
        colourBySource={colourBySource}
        solarDiagramOn={solar.showPath}
        solarNeutralFill={solarNeutralFill}
        onBounds={onBounds}
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
  );
}
