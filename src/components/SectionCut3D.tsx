import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
import {
  keepsPoint,
  maxOffsetM,
  offsetFromPoint,
  sectionNormalEN,
  sectionWorldPlane,
  settleOffset,
  snapOffset,
  type SectionCutStore,
  type SectionFill,
} from "../lib/sectionCut";

const CLIP_ROOTS = new Set(["CityCut", "Contours3d", "HeightEditOverlay"]);
const CAP_SOURCE = /^(Buildings|BasePlinth|Terrain|Trees|Tree)/;
const CAP_NAME = "SectionCutCap";

type CapPair = { source: THREE.Mesh; cap: THREE.Mesh };

function hasCapAncestor(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (CAP_SOURCE.test(node.name)) return true;
    if (node.name === "CityCut") return false;
    node = node.parent;
  }
  return false;
}

function forEachMaterial(object: THREE.Object3D, visit: (material: THREE.Material) => void) {
  const carrier = object as THREE.Mesh;
  if (!carrier.material) return;
  if (Array.isArray(carrier.material)) carrier.material.forEach(visit);
  else visit(carrier.material);
}

function setClip(material: THREE.Material, planes: THREE.Plane[] | null) {
  const current = material.clippingPlanes;
  const same = planes ? current?.length === planes.length && current[0] === planes[0] : !current || current.length === 0;
  if (same) return;
  material.clippingPlanes = planes;
  material.needsUpdate = true;
}

function makeCapMaterial(plane: THREE.Plane): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, clippingPlanes: [plane] });
  material.name = CAP_NAME;
  const paper = { value: new THREE.Color() };
  const hatch = { value: 0 };
  material.userData.paper = paper;
  material.userData.hatch = hatch;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaper = paper;
    shader.uniforms.uHatch = hatch;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 uPaper;\nuniform float uHatch;\nvoid main() {")
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity );\nfloat sectionStripe = step( 0.72, fract( ( gl_FragCoord.x + gl_FragCoord.y ) / 10.0 ) );\ndiffuseColor.rgb = mix( diffuseColor.rgb, mix( uPaper, diffuse, sectionStripe ), uHatch );",
      );
  };
  return material;
}

function paintCap(material: THREE.MeshBasicMaterial, fill: SectionFill) {
  if (fill === "hatch") {
    material.color.setStyle(getColour("--hatch-ink"));
    (material.userData.paper as { value: THREE.Color }).value.setStyle(getColour("--hatch-paper"));
    (material.userData.hatch as { value: number }).value = 1;
  } else {
    material.color.setStyle(getColour("--figure-fill"));
    (material.userData.hatch as { value: number }).value = 0;
  }
}

function buildCaps(root: THREE.Object3D, material: THREE.Material, into: THREE.Group): CapPair[] {
  const pairs: CapPair[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.name === CAP_NAME || !hasCapAncestor(mesh)) return;
    const instanced = mesh as THREE.InstancedMesh;
    let cap: THREE.Mesh;
    if (instanced.isInstancedMesh) {
      const copy = new THREE.InstancedMesh(instanced.geometry, material, instanced.count);
      copy.instanceMatrix = instanced.instanceMatrix;
      copy.frustumCulled = false;
      cap = copy;
    } else {
      cap = new THREE.Mesh(mesh.geometry, material);
    }
    cap.name = CAP_NAME;
    cap.matrixAutoUpdate = false;
    cap.matrix.copy(mesh.matrixWorld);
    cap.raycast = () => {};
    pairs.push({ source: mesh, cap });
    into.add(cap);
  });
  return pairs;
}

export function SectionCut3D({
  store,
  sideM,
  bottomY,
  topY,
}: {
  store: SectionCutStore;
  sideM: number;
  bottomY: number;
  topY: number;
}) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const { gl, scene, controls, camera } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);
  const planes = useMemo(() => [plane], [plane]);
  const capMaterial = useMemo(() => makeCapMaterial(plane), [plane]);
  const capGroup = useMemo(() => {
    const group = new THREE.Group();
    group.name = "SectionCutCaps";
    return group;
  }, []);
  const widget = useRef<THREE.Group>(null);
  const handle = useRef<THREE.Group>(null);
  const fillMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const shown = useRef({ offset: state.offsetM, angle: state.angleDeg, pulse: 0, glow: 0 });
  const clipped = useRef<{ root: THREE.Object3D | null; pairs: CapPair[]; sweep: number }>({ root: null, pairs: [], sweep: 0 });
  const drag = useRef<{ grab: number; level: THREE.Plane; snapped: boolean } | null>(null);
  const hover = useRef(false);
  const accent = getColour("--site-building");
  const ink = getColour("--figure-fill");

  useEffect(() => {
    paintCap(capMaterial, state.fill);
  }, [capMaterial, state.fill]);

  useEffect(() => {
    if (state.enabled) shown.current.pulse = 1;
  }, [state.flipped, state.enabled]);

  useEffect(() => {
    gl.localClippingEnabled = state.enabled;
    if (state.enabled) {
      const current = store.get();
      shown.current.offset = current.offsetM;
      const facing = !keepsPoint(current, camera.position.x, -camera.position.z);
      if (!facing) store.set({ flipped: !current.flipped });
      return;
    }
    const tracked = clipped.current;
    for (const child of scene.children) {
      if (!CLIP_ROOTS.has(child.name)) continue;
      child.traverse((object) => forEachMaterial(object, (material) => setClip(material, null)));
    }
    for (const pair of tracked.pairs) capGroup.remove(pair.cap);
    tracked.pairs = [];
    tracked.root = null;
  }, [state.enabled, gl, scene, capGroup, store, camera]);

  useEffect(
    () => () => {
      gl.localClippingEnabled = false;
      capMaterial.dispose();
      delete gl.domElement.dataset.sectionHandle;
      delete gl.domElement.dataset.sectionOffset;
    },
    [gl, capMaterial],
  );

  useFrame((frame, delta) => {
    const current = store.get();
    const element = gl.domElement;
    if (!current.enabled) {
      if (element.dataset.sectionHandle) delete element.dataset.sectionHandle;
      return;
    }
    const s = shown.current;
    const k = 1 - Math.exp(-delta * (drag.current ? 26 : 14));
    s.offset += (current.offsetM - s.offset) * k;
    if (Math.abs(current.offsetM - s.offset) < 0.01) s.offset = current.offsetM;
    let angleDelta = current.angleDeg - s.angle;
    if (angleDelta > 90) angleDelta -= 180;
    if (angleDelta < -90) angleDelta += 180;
    s.angle += angleDelta * k;
    if (Math.abs(angleDelta) < 0.01) s.angle = current.angleDeg;
    s.pulse = Math.max(0, s.pulse - delta * 3.2);
    const target = drag.current || hover.current ? 1 : 0;
    s.glow += (target - s.glow) * (1 - Math.exp(-delta * 12));

    const world = sectionWorldPlane({ angleDeg: s.angle, offsetM: s.offset, flipped: current.flipped });
    plane.normal.set(world.normal[0], world.normal[1], world.normal[2]);
    plane.constant = world.constant;

    const tracked = clipped.current;
    const root = scene.getObjectByName("CityCut") ?? null;
    if (root !== tracked.root) {
      for (const pair of tracked.pairs) capGroup.remove(pair.cap);
      tracked.pairs = root ? buildCaps(root, capMaterial, capGroup) : [];
      tracked.root = root;
      tracked.sweep = 0;
    }
    if (tracked.sweep <= 0) {
      for (const child of scene.children) {
        if (!CLIP_ROOTS.has(child.name)) continue;
        child.traverse((object) => {
          if (object.name === CAP_NAME) return;
          forEachMaterial(object, (material) => setClip(material, planes));
        });
      }
      tracked.sweep = 20;
    }
    tracked.sweep -= 1;
    for (const pair of tracked.pairs) {
      pair.cap.matrix.copy(pair.source.matrixWorld);
      pair.cap.visible = pair.source.visible && (pair.source.parent?.visible ?? true);
      const instanced = pair.cap as THREE.InstancedMesh;
      if (instanced.isInstancedMesh) instanced.count = (pair.source as THREE.InstancedMesh).count;
    }

    const group = widget.current;
    if (group) {
      const [ne, nn] = sectionNormalEN(s.angle);
      group.position.set(ne * s.offset, (bottomY + topY) / 2, -nn * s.offset);
      group.rotation.set(0, (s.angle * Math.PI) / 180, 0);
    }
    if (fillMaterial.current) fillMaterial.current.opacity = 0.1 + 0.12 * s.glow + 0.22 * s.pulse;
    const grip = handle.current;
    if (grip) {
      const scale = 1 + 0.18 * s.glow + 0.35 * s.pulse;
      grip.scale.setScalar(scale);
      grip.updateMatrixWorld();
      const point = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld).project(frame.camera);
      const rect = element.getBoundingClientRect();
      const x = Math.round(rect.left + ((point.x + 1) / 2) * rect.width);
      const y = Math.round(rect.top + ((1 - point.y) / 2) * rect.height);
      element.dataset.sectionHandle = `${x},${y}`;
    }
    element.dataset.sectionOffset = s.offset.toFixed(2);
  });

  const height = Math.max(12, Math.min(topY - bottomY + 12, sideM * 0.22));
  const width = maxOffsetM(sideM) * 2;
  const frame = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)), [width, height]);
  useEffect(() => () => frame.dispose(), [frame]);
  const gripRadius = Math.max(4, sideM * 0.018);

  const setControls = (enabled: boolean) => {
    const orbit = controls as unknown as OrbitControlsImpl | null;
    if (orbit) orbit.enabled = enabled;
  };

  const onDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const target = event.target as Element | null;
    target?.setPointerCapture?.(event.pointerId);
    const level = new THREE.Plane(new THREE.Vector3(0, 1, 0), -event.point.y);
    const current = store.get();
    drag.current = {
      grab: offsetFromPoint(event.point.x, -event.point.z, current.angleDeg) - current.offsetM,
      level,
      snapped: false,
    };
    setControls(false);
    document.body.style.cursor = "grabbing";
  };

  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current;
    if (!active) return;
    event.stopPropagation();
    const hit = event.ray.intersectPlane(active.level, new THREE.Vector3());
    if (!hit) return;
    const current = store.get();
    const raw = offsetFromPoint(hit.x, -hit.z, current.angleDeg) - active.grab;
    const next = snapOffset(raw, sideM, event.altKey);
    if (next.snapped && !active.snapped) shown.current.pulse = 0.5;
    active.snapped = next.snapped;
    store.set({ offsetM: Math.round(next.offsetM * 100) / 100 });
  };

  const onUp = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    event.stopPropagation();
    const target = event.target as Element | null;
    target?.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    if (!event.altKey) store.set({ offsetM: settleOffset(store.get().offsetM, sideM) });
    setControls(true);
    document.body.style.cursor = hover.current ? "grab" : "";
  };

  const onOver = () => {
    hover.current = true;
    if (!drag.current) document.body.style.cursor = "grab";
  };
  const onOut = () => {
    hover.current = false;
    if (!drag.current) document.body.style.cursor = "";
  };

  if (!state.enabled) return null;
  return (
    <>
      <primitive object={capGroup} />
      <group
        ref={(node: THREE.Group | null) => {
          widget.current = node;
          if (node) markScreenOnly(node);
        }}
      >
        <mesh
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerOver={onOver}
          onPointerOut={onOut}
          renderOrder={10}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            ref={fillMaterial}
            color={accent}
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <lineSegments geometry={frame} renderOrder={11}>
          <lineBasicMaterial color={ink} transparent opacity={0.55} depthWrite={false} />
        </lineSegments>
        <group ref={handle} position={[0, -height / 2 + gripRadius * 2.4, 0]}>
          <mesh
            rotation={[Math.PI / 2, 0, 0]}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerOver={onOver}
            onPointerOut={onOut}
            renderOrder={12}
          >
            <cylinderGeometry args={[gripRadius, gripRadius, gripRadius * 0.5, 32]} />
            <meshBasicMaterial color={accent} depthTest={false} transparent />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={13}>
            <torusGeometry args={[gripRadius, gripRadius * 0.14, 8, 40]} />
            <meshBasicMaterial color={ink} depthTest={false} transparent />
          </mesh>
        </group>
      </group>
    </>
  );
}
