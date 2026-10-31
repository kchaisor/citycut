import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { mountSectionKnifeClip, type SectionKnifeClipMount } from "../lib/sectionKnife/clipCity";
import {
  idleSectionKnifeGizmoInteraction,
  projectToCanvasPixels,
  screenConstantHitRadiusM,
  type SectionKnifeGizmoInteraction,
} from "../lib/sectionKnife/gizmoHit";
import { knifeNormalXZ, knifePlane, planeCutRect, type SectionKnifePose } from "../lib/sectionKnife/plane";
import type { CityModel } from "../types";

type DragMode = "move" | "rotate" | null;

const HIT_PX = 28;

function mergeInteraction(
  hover: "move" | "rotate" | null,
  drag: DragMode,
): SectionKnifeGizmoInteraction {
  if (drag) return { orbitLock: true, cursor: "grabbing" };
  if (hover) return { orbitLock: true, cursor: "grab" };
  return idleSectionKnifeGizmoInteraction;
}

export function SectionKnifeScene({
  city,
  model,
  active,
  pose,
  onPoseChange,
  onGizmoInteractionChange,
}: {
  city: THREE.Object3D;
  model: CityModel;
  active: boolean;
  pose: SectionKnifePose;
  onPoseChange: (pose: SectionKnifePose) => void;
  onGizmoInteractionChange?: (state: SectionKnifeGizmoInteraction) => void;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const clipRef = useRef<SectionKnifeClipMount | null>(null);
  const dragRef = useRef<DragMode>(null);
  const dragStartRef = useRef<{ pointer: THREE.Vector2; pose: SectionKnifePose } | null>(null);
  const hoverRef = useRef<"move" | "rotate" | null>(null);
  const handleHitRef = useRef<THREE.Mesh>(null);
  const ringHitRef = useRef<THREE.Mesh>(null);
  const handleWorldRef = useRef(new THREE.Vector3());
  const ringWorldRef = useRef(new THREE.Vector3());
  const [hoverHandle, setHoverHandle] = useState(false);
  const [hoverRing, setHoverRing] = useState(false);

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
    planeMesh.raycast = () => {};
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

  const visualHandleR = Math.max(2.5, model.sideM * 0.012);
  const visualRingR = Math.max(4, model.sideM * 0.022);

  function publishInteraction() {
    onGizmoInteractionChange?.(mergeInteraction(hoverRef.current, dragRef.current));
  }

  function pointerOnCanvas(event: PointerEvent): THREE.Vector2 {
    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(event.clientX - rect.left, event.clientY - rect.top);
  }

  function endDragListeners() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
  }

  function onWindowPointerMove(event: PointerEvent) {
    const mode = dragRef.current;
    const start = dragStartRef.current;
    if (!mode || !start) return;
    event.preventDefault();
    event.stopPropagation();
    const pointer = pointerOnCanvas(event);
    const dx = pointer.x - start.pointer.x;
    const dy = pointer.y - start.pointer.y;
    if (mode === "move") {
      const normal = knifeNormalXZ(start.pose);
      const delta = (dx - dy) * 0.05;
      onPoseChange({ ...start.pose, offsetM: start.pose.offsetM + delta * (normal.x + normal.z) * 0.7 });
    } else if (mode === "rotate") {
      onPoseChange({ ...start.pose, angleRad: start.pose.angleRad - dx * 0.008 });
    }
    invalidate();
  }

  function onWindowPointerUp(event: PointerEvent) {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    dragStartRef.current = null;
    try {
      gl.domElement.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    endDragListeners();
    publishInteraction();
    invalidate();
  }

  function beginDrag(mode: DragMode, event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    dragRef.current = mode;
    dragStartRef.current = {
      pointer: pointerOnCanvas(event.nativeEvent),
      pose: { ...pose },
    };
    try {
      gl.domElement.setPointerCapture(event.nativeEvent.pointerId);
    } catch {
      // ignore
    }
    window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", onWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", onWindowPointerUp, { passive: false });
    publishInteraction();
  }

  function setHover(part: "move" | "rotate" | null) {
    hoverRef.current = part;
    setHoverHandle(part === "move");
    setHoverRing(part === "rotate");
    publishInteraction();
  }

  useLayoutEffect(() => {
    if (!active) {
      dragRef.current = null;
      dragStartRef.current = null;
      hoverRef.current = null;
      endDragListeners();
      onGizmoInteractionChange?.(idleSectionKnifeGizmoInteraction);
    }
  }, [active, onGizmoInteractionChange]);

  useLayoutEffect(() => {
    for (const mesh of [handleHitRef.current, ringHitRef.current]) {
      if (mesh) mesh.userData.sectionKnifeGizmoHit = true;
    }
  }, [active]);

  useEffect(() => {
    return () => {
      endDragListeners();
    };
  }, []);

  useFrame(() => {
    if (!active) {
      delete gl.domElement.dataset.sectionKnifeHandleX;
      delete gl.domElement.dataset.sectionKnifeHandleY;
      delete gl.domElement.dataset.sectionKnifeRingX;
      delete gl.domElement.dataset.sectionKnifeRingY;
      return;
    }
    handleWorldRef.current.copy(handlePos);
    ringWorldRef.current.copy(rotatePos);
    const canvasH = gl.domElement.clientHeight || size.height;
    const handleR = screenConstantHitRadiusM(camera, handleWorldRef.current, HIT_PX, canvasH);
    const ringR = screenConstantHitRadiusM(camera, ringWorldRef.current, HIT_PX, canvasH);
    if (handleHitRef.current) handleHitRef.current.scale.setScalar(handleR);
    if (ringHitRef.current) ringHitRef.current.scale.setScalar(ringR);
    const handlePx = projectToCanvasPixels(camera, handleWorldRef.current, gl.domElement);
    const ringPx = projectToCanvasPixels(camera, ringWorldRef.current, gl.domElement);
    if (handlePx && !handlePx.behind) {
      gl.domElement.dataset.sectionKnifeHandleX = handlePx.x.toFixed(1);
      gl.domElement.dataset.sectionKnifeHandleY = handlePx.y.toFixed(1);
    } else {
      delete gl.domElement.dataset.sectionKnifeHandleX;
      delete gl.domElement.dataset.sectionKnifeHandleY;
    }
    if (ringPx && !ringPx.behind) {
      gl.domElement.dataset.sectionKnifeRingX = ringPx.x.toFixed(1);
      gl.domElement.dataset.sectionKnifeRingY = ringPx.y.toFixed(1);
    } else {
      delete gl.domElement.dataset.sectionKnifeRingX;
      delete gl.domElement.dataset.sectionKnifeRingY;
    }
  });

  if (!active) return null;

  const cut = getColour("--section-knife-cut-edge");
  const handleHighlight = getColour("--section-knife-handle-hover");

  return (
    <>
      <group position={handlePos} renderOrder={2000}>
        <mesh renderOrder={2001}>
          <sphereGeometry args={[visualHandleR, 20, 20]} />
          <meshBasicMaterial
            color={hoverHandle ? handleHighlight : cut}
            depthTest={false}
            transparent
            opacity={hoverHandle ? 1 : 0.88}
          />
        </mesh>
        <mesh
          ref={handleHitRef}
          renderOrder={2002}
          onPointerDown={(event) => beginDrag("move", event)}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHover("move");
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            if (dragRef.current === "move") return;
            if (hoverRef.current === "move") setHover(null);
          }}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial transparent opacity={0.001} depthTest={false} depthWrite={false} color={cut} />
        </mesh>
      </group>
      <group position={rotatePos} renderOrder={2000}>
        <mesh renderOrder={2001}>
          <torusGeometry args={[visualRingR, 0.35, 8, 32]} />
          <meshBasicMaterial
            color={hoverRing ? handleHighlight : cut}
            depthTest={false}
            transparent
            opacity={hoverRing ? 1 : 0.75}
            wireframe
          />
        </mesh>
        <mesh
          ref={ringHitRef}
          renderOrder={2002}
          onPointerDown={(event) => beginDrag("rotate", event)}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHover("rotate");
          }}
          onPointerOut={(event) => {
            event.stopPropagation();
            if (dragRef.current === "rotate") return;
            if (hoverRef.current === "rotate") setHover(null);
          }}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial transparent opacity={0.001} depthTest={false} depthWrite={false} color={cut} />
        </mesh>
      </group>
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
