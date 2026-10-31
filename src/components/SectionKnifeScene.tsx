import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { mountSectionKnifeClip, type SectionKnifeClipMount } from "../lib/sectionKnife/clipCity";
import { knifeNormalXZ, knifePlane, planeCutRect, type SectionKnifePose } from "../lib/sectionKnife/plane";
import type { CityModel } from "../types";

type DragMode = "move" | "rotate" | null;

export function SectionKnifeScene({
  city,
  model,
  active,
  pose,
  onPoseChange,
}: {
  city: THREE.Object3D;
  model: CityModel;
  active: boolean;
  pose: SectionKnifePose;
  onPoseChange: (pose: SectionKnifePose) => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const clipRef = useRef<SectionKnifeClipMount | null>(null);
  const dragRef = useRef<DragMode>(null);
  const dragStartRef = useRef<{ pointer: THREE.Vector2; pose: SectionKnifePose } | null>(null);
  const [hoverHandle, setHoverHandle] = useState(false);

  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  useLayoutEffect(() => {
    clipRef.current?.dispose();
    clipRef.current = mountSectionKnifeClip(city, model);
    return () => {
      clipRef.current?.dispose();
      clipRef.current = null;
    };
  }, [city, model]);

  useLayoutEffect(() => {
    clipRef.current?.apply(active, pose);
    invalidate();
  }, [active, pose, invalidate]);

  const groundY = model.terrain ? model.terrain.min : 0;
  let topY = groundY + 25;
  for (const building of model.buildings) topY = Math.max(topY, groundY + building.height);

  const gizmo = useMemo(() => {
    const half = model.sideM * 0.52;
    const group = new THREE.Group();
    group.name = "SectionKnifeGizmo";
    const planeGeo = new THREE.PlaneGeometry(half * 2, topY - groundY + 2);
    const planeMat = new THREE.MeshBasicMaterial({
      color: getColour("--section-knife-plane"),
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.name = "SectionKnifePlaneVisual";
    planeMesh.position.y = (groundY + topY) / 2;
    group.add(planeMesh);
    return group;
  }, [model.sideM, groundY, topY]);

  useLayoutEffect(() => {
    const normal = knifeNormalXZ(pose);
    gizmo.position.set(normal.x * pose.offsetM, 0, normal.z * pose.offsetM);
    gizmo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    gizmo.visible = active;
  }, [gizmo, pose, active]);

  useLayoutEffect(() => {
    if (!active) return;
    if (city.getObjectByName("SectionKnifeGizmo")) return;
    city.add(gizmo);
    return () => {
      gizmo.removeFromParent();
    };
  }, [city, gizmo, active]);

  const handlePos = useMemo(() => {
    const normal = knifeNormalXZ(pose);
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const base = normal.clone().multiplyScalar(pose.offsetM).add(tangent.multiplyScalar(model.sideM * 0.18));
    base.y = groundY + 4;
    return base;
  }, [pose, model.sideM, groundY]);

  const rotatePos = useMemo(() => {
    const normal = knifeNormalXZ(pose);
    const p = normal.clone().multiplyScalar(pose.offsetM);
    p.y = groundY + 1.2;
    return p;
  }, [pose, groundY]);

  function beginDrag(mode: DragMode, event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    dragRef.current = mode;
    dragStartRef.current = {
      pointer: new THREE.Vector2(event.nativeEvent.offsetX, event.nativeEvent.offsetY),
      pose: { ...pose },
    };
    (event.target as HTMLElement | null)?.setPointerCapture?.(event.nativeEvent.pointerId);
  }

  function endDrag(event: ThreeEvent<PointerEvent>) {
    dragRef.current = null;
    dragStartRef.current = null;
    (event.target as HTMLElement | null)?.releasePointerCapture?.(event.nativeEvent.pointerId);
  }

  function onPointerMove(event: ThreeEvent<PointerEvent>) {
    const mode = dragRef.current;
    const start = dragStartRef.current;
    if (!mode || !start) return;
    event.stopPropagation();
    const dx = event.nativeEvent.offsetX - start.pointer.x;
    const dy = event.nativeEvent.offsetY - start.pointer.y;
    if (mode === "move") {
      const normal = knifeNormalXZ(start.pose);
      const delta = (dx - dy) * 0.05;
      onPoseChange({ ...start.pose, offsetM: start.pose.offsetM + delta * (normal.x + normal.z) * 0.7 });
    } else if (mode === "rotate") {
      onPoseChange({ ...start.pose, angleRad: start.pose.angleRad - dx * 0.008 });
    }
    invalidate();
  }

  if (!active) return null;

  return (
    <>
      <mesh
        position={handlePos}
        onPointerDown={(event) => beginDrag("move", event)}
        onPointerUp={endDrag}
        onPointerMove={onPointerMove}
        onPointerOver={() => setHoverHandle(true)}
        onPointerOut={() => setHoverHandle(false)}
      >
        <sphereGeometry args={[Math.max(2.5, model.sideM * 0.012), 16, 16]} />
        <meshBasicMaterial color={getColour("--section-knife-cut-edge")} depthTest={false} transparent opacity={hoverHandle ? 1 : 0.85} />
      </mesh>
      <mesh
        position={rotatePos}
        onPointerDown={(event) => beginDrag("rotate", event)}
        onPointerUp={endDrag}
        onPointerMove={onPointerMove}
      >
        <torusGeometry args={[Math.max(4, model.sideM * 0.022), 0.35, 8, 32]} />
        <meshBasicMaterial color={getColour("--section-knife-cut-edge")} depthTest={false} wireframe />
      </mesh>
    </>
  );
}

export function sectionKnifeCutPolyline(pose: SectionKnifePose, sideM: number, groundY: number, topY: number): [number, number][] {
  const pts = planeCutRect(pose, sideM * 0.55, groundY, topY);
  return pts.slice(0, 4).map((p) => [p.x, p.z] as [number, number]);
}

export function sectionKnifePlaneConstant(pose: SectionKnifePose): THREE.Plane {
  return knifePlane(pose);
}
