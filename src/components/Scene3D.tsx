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
import { flushControlInertia, holdControlPose } from "../lib/controlInertia";
import {
  eyeDistance,
  fitOrthoZoom,
  frameCentre,
  isoEye,
  isoOffset,
  orthoNearFar,
  type Aabb,
  type IsoCorner,
  type Vec3,
} from "../lib/isoCamera";
import type { ProjectionMode } from "../lib/viewMemory";
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
  onBounds,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  onBounds: (bounds: Aabb) => void;
}) {
  const onBoundsRef = useRef(onBounds);
  onBoundsRef.current = onBounds;
  const colourTick = useColourRevision();
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
  useLayoutEffect(() => () => disposeObject(group), [group]);
  return <primitive object={group} />;
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

function PerspectiveSetup({
  camera,
  controlsRef,
  side,
  lift,
}: {
  camera: THREE.PerspectiveCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  side: number;
  lift: number;
}) {
  const ready = useRef(false);
  const place = useCallback(() => {
    const controls = controlsRef.current;
    if (ready.current || !controls) return;
    camera.position.set(side * 0.78, lift + side * 0.62, side * 0.86);
    camera.near = Math.max(0.1, side / 400);
    camera.far = side * 40;
    controls.target.set(0, lift + side * 0.02, 0);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
    ready.current = true;
  }, [camera, controlsRef, side, lift]);
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
}: {
  camera: THREE.OrthographicCamera;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  boundsRef: RefObject<Aabb | null>;
  corner: IsoCorner;
  snapId: number;
  active: boolean;
  touchedRef: RefObject<boolean>;
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
    const centre = frameCentre(bounds);
    const direction = isoOffset(corner);
    const distance = eyeDistance(bounds);
    const eye = isoEye(centre, corner, distance);
    const planes = orthoNearFar(bounds, eye, centre);
    flushControlInertia(controls);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.near = planes.near;
    camera.far = planes.far;
    camera.zoom = fitOrthoZoom(bounds, direction, size.width, size.height);
    camera.updateProjectionMatrix();
    controls.target.set(centre[0], centre[1], centre[2]);
    camera.lookAt(controls.target);
    controls.update();
    fittedKey.current = key;
    touchedRef.current = false;
  }, [active, camera, controlsRef, boundsRef, corner, snapId, size.width, size.height, touchedRef]);
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
    const iso = projection === "iso";
    const camera = iso ? ortho : persp;
    const controls = iso ? orthoControls.current : perspControls.current;
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

function ExportBridge({ onExportReady }: { onExportReady: (exporter: SceneExporter | null) => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const get = useThree((state) => state.get);
  useLayoutEffect(() => {
    onExportReady({
      png: () => captureViewPng(gl, scene, get().camera),
      shot: () => shotFromCamera(get().camera, gl.domElement.clientWidth, gl.domElement.clientHeight),
    });
    return () => onExportReady(null);
  }, [gl, scene, get, onExportReady]);
  return null;
}

function Cameras({
  side,
  lift,
  projection,
  corner,
  freeRotate,
  snapId,
  boundsRef,
  onExportReady,
}: {
  side: number;
  lift: number;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
  boundsRef: RefObject<Aabb | null>;
  onExportReady: (exporter: SceneExporter | null) => void;
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
  const persp = perspRef.current;
  const ortho = orthoRef.current;

  return (
    <>
      <perspectiveCamera ref={perspRef} fov={32} />
      <orthographicCamera ref={orthoRef} />
      {ready && persp && ortho && (
        <>
          <BindCamera camera={iso ? ortho : persp} />
          <FrameCameras persp={persp} ortho={ortho} />
          <PerspectiveSetup camera={persp} controlsRef={perspControls} side={side} lift={lift} />
          <HoldPoseWhenInactive controlsRef={perspControls} active={!iso} />
          <HoldPoseWhenInactive controlsRef={orthoControls} active={iso} />
          <IsoSnap
            camera={ortho}
            controlsRef={orthoControls}
            boundsRef={boundsRef}
            corner={corner}
            snapId={snapId}
            active={iso && !freeRotate}
            touchedRef={touchedRef}
          />
          <OrthoClip camera={ortho} controlsRef={orthoControls} boundsRef={boundsRef} active={iso} />
          <OrbitControls
            ref={perspControls}
            camera={persp}
            makeDefault={!iso}
            enabled={!iso}
            enableDamping
            dampingFactor={0.08}
            maxPolarAngle={Math.PI / 2.02}
            minDistance={side * 0.2}
            maxDistance={side * 3.4}
          />
          <OrbitControls
            ref={orthoControls}
            camera={ortho}
            makeDefault={iso}
            enabled={iso}
            enableDamping
            dampingFactor={0.08}
            enableRotate={freeRotate}
            zoomToCursor
            maxPolarAngle={Math.PI / 2.02}
            minDistance={1}
            maxDistance={side * 20}
            mouseButtons={{
              LEFT: freeRotate ? MOUSE.ROTATE : MOUSE.PAN,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            touches={{
              ONE: freeRotate ? TOUCH.ROTATE : TOUCH.PAN,
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
          <ExportBridge onExportReady={onExportReady} />
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
  onExportReady,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
  snapId: number;
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
  return (
    <Canvas className="scene-canvas" dpr={[1, 1.75]} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={[modelBg]} />
      <hemisphereLight args={[sky, groundLight, 0.7]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[model.sideM * 0.4, model.sideM, model.sideM * 0.2]} intensity={1.35} />
      <City model={model} uniformBuildings={uniformBuildings} colourBySource={colourBySource} onBounds={onBounds} />
      <Cameras
        side={model.sideM}
        lift={lift}
        projection={projection}
        corner={corner}
        freeRotate={freeRotate}
        snapId={snapId}
        boundsRef={boundsRef}
        onExportReady={onExportReady}
      />
    </Canvas>
  );
}
