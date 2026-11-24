import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from "react";
import * as THREE from "three";
import type { Pt, CityModel } from "../types";
import { getColour } from "../lib/colours";
import { ARROW_COLOUR_TOKENS, clampArrowHeight, visibleIn3d, type DiagramArrow } from "../lib/diagramArrows";
import { arrowMidpoint, distanceToPath, nearestPointIndex, smoothArrowPath } from "../lib/diagramArrowsPath";
import { buildArrowShape, emptyArrowShape } from "../lib/diagramArrowsShape";
import {
  ARROW_GUMBALL,
  arrowGumball,
  arrowShapeGeometry,
  arrowWorldPoint,
  disposeGumball,
  groundAtFor,
  gumballHit,
  gumballPlane,
  gumballWorldY,
  intersectArrowPlane,
  markArrowEditor,
  projectGroundPoint,
} from "../lib/diagramArrows3d";
import {
  arrowToolClickActions,
  isDoubleClick,
  selectedArrow,
  type ArrowToolAction,
  type ArrowToolState,
  type ClickStamp,
} from "../lib/diagramArrowsTool";
import {
  animatedArrows,
  arrowClockSeconds,
  arrowKeepsBodyWhileLive,
  lightenArrowColour,
  liveArrowShape,
  publishArrowAnimation,
  useArrowMotionStopped,
} from "../lib/diagramArrowsMotion";
import { markExportOnly, markScreenOnly } from "../lib/screenOnly";
import { useColourRevision } from "../lib/useColourRevision";

const HANDLE_HIT_PX = 12;
const BODY_HIT_PX = 9;
const CLICK_MAX_PX = 5;
const HANDLE_SIDE_FRAC = 0.008;
const STREAK_LIFT_M = 0.05;
const GUMBALL_HIT_PX = 14;
const GUMBALL_RADIUS_FRAC = HANDLE_SIDE_FRAC * 1.6;

type LiveArrow = { arrow: DiagramArrow; body: THREE.Mesh; comets: THREE.Mesh };

const EMPTY_GEOMETRY = new THREE.BufferGeometry();

function setGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry | null): void {
  if (mesh.geometry !== EMPTY_GEOMETRY) mesh.geometry.dispose();
  mesh.geometry = geometry ?? EMPTY_GEOMETRY;
}

function updateLive(item: LiveArrow, model: CityModel, groundAt: ReturnType<typeof groundAtFor>, seconds: number): void {
  const live = liveArrowShape(item.arrow, model.sideM, 0, seconds);
  setGeometry(item.body, arrowShapeGeometry(live.body, groundAt, item.arrow.heightM));
  setGeometry(item.comets, arrowShapeGeometry({ ...emptyArrowShape(), ribbons: live.comets }, groundAt, item.arrow.heightM, STREAK_LIFT_M));
}

function liveMeshes(arrow: DiagramArrow, model: CityModel, groundAt: ReturnType<typeof groundAtFor>, seconds: number): LiveArrow {
  const base = getColour(ARROW_COLOUR_TOKENS[arrow.colour]);
  const body = new THREE.Mesh(
    EMPTY_GEOMETRY,
    new THREE.MeshBasicMaterial({ color: base, side: THREE.DoubleSide, toneMapped: false }),
  );
  body.renderOrder = 40;
  const comets = new THREE.Mesh(
    EMPTY_GEOMETRY,
    new THREE.MeshBasicMaterial({
      color: arrow.style === "streak" ? base : lightenArrowColour(base),
      side: THREE.DoubleSide,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    }),
  );
  comets.renderOrder = 41;
  for (const mesh of [body, comets]) {
    mesh.frustumCulled = false;
    mesh.userData.noScenePick = true;
    markScreenOnly(mesh);
    markArrowEditor(mesh);
  }
  const item = { arrow, body, comets };
  updateLive(item, model, groundAt, seconds);
  return item;
}

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    if (child.userData[ARROW_GUMBALL]) disposeGumball(child as THREE.Group);
    else {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry !== EMPTY_GEOMETRY) mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
    group.remove(child);
  }
}

function arrowMesh(
  arrow: Pick<DiagramArrow, "points" | "style" | "width" | "colour" | "heightM">,
  model: CityModel,
  groundAt: ReturnType<typeof groundAtFor>,
  opacity: number,
): THREE.Mesh | null {
  const geometry = arrowShapeGeometry(buildArrowShape(arrow.points, arrow.style, arrow.width, model.sideM), groundAt, arrow.heightM);
  if (!geometry) return null;
  const faded = geometry.userData.faded === true;
  const material = new THREE.MeshBasicMaterial({
    color: getColour(ARROW_COLOUR_TOKENS[arrow.colour]),
    side: THREE.DoubleSide,
    vertexColors: faded,
    transparent: opacity < 1 || faded,
    opacity,
    depthWrite: !faded,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 40;
  mesh.userData.noScenePick = true;
  return mesh;
}

function handleMesh(at: THREE.Vector3, radius: number, selected: boolean): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: getColour(selected ? "--arrow-handle" : "--arrow-ink"),
    depthTest: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
  mesh.position.copy(at);
  mesh.renderOrder = 60;
  mesh.userData.noScenePick = true;
  markScreenOnly(mesh);
  markArrowEditor(mesh);
  return mesh;
}

type DragState =
  | { kind: "point"; id: string; index: number; heightM: number }
  | { kind: "height"; id: string; plane: THREE.Plane; startY: number; startHeightM: number };

export function DiagramArrows3D({
  model,
  state,
  dispatch,
  active,
  flat,
  onOrbitLock,
}: {
  model: CityModel;
  state: ArrowToolState;
  dispatch: Dispatch<ArrowToolAction>;
  active: boolean;
  flat: boolean;
  onOrbitLock?: (locked: boolean) => void;
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const colourRevision = useColourRevision();
  const groundAt = useMemo(() => groundAtFor(model), [model.terrain, model.sideM]);
  const [hover, setHover] = useState<Pt | null>(null);
  const root = useMemo(() => {
    const group = new THREE.Group();
    group.name = "DiagramArrows";
    return group;
  }, []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const groundRef = useRef(groundAt);
  groundRef.current = groundAt;
  const flatRef = useRef(flat);
  flatRef.current = flat;
  const orbitLockRef = useRef(onOrbitLock);
  orbitLockRef.current = onOrbitLock;
  const showing = state.visible && active;
  const arrows = useMemo(() => (showing ? visibleIn3d(state.arrows) : []), [showing, state.arrows]);
  const handleRadius = model.sideM * HANDLE_SIDE_FRAC;
  const reducedMotion = useArrowMotionStopped();
  const liveRef = useRef<LiveArrow[]>([]);
  const animatedCount = useMemo(() => animatedArrows(arrows, reducedMotion).length, [arrows, reducedMotion]);

  useEffect(() => {
    if (animatedCount === 0) return;
    return publishArrowAnimation(animatedCount);
  }, [animatedCount]);

  useLayoutEffect(() => {
    scene.add(root);
    return () => {
      scene.remove(root);
      disposeGroup(root);
    };
  }, [scene, root]);

  useLayoutEffect(() => {
    disposeGroup(root);
    liveRef.current = [];
    const seconds = arrowClockSeconds();
    const animated = new Set(animatedArrows(arrows, reducedMotion));
    for (const arrow of arrows) {
      const mesh = arrowMesh(arrow, model, groundAt, 1);
      if (mesh) {
        if (animated.has(arrow) && !arrowKeepsBodyWhileLive(arrow)) {
          mesh.visible = false;
          markExportOnly(mesh);
        }
        root.add(mesh);
      }
      if (animated.has(arrow)) {
        const live = liveMeshes(arrow, model, groundAt, seconds);
        liveRef.current.push(live);
        root.add(live.body, live.comets);
      }
    }
    const draft = showing && state.active ? state.draft : null;
    if (draft) {
      const preview = hover ? [...draft, hover] : draft;
      const mesh = preview.length >= 2 ? arrowMesh({ ...state.defaults, points: preview }, model, groundAt, 0.65) : null;
      if (mesh) {
        markScreenOnly(mesh);
        markArrowEditor(mesh);
        root.add(mesh);
      }
      for (const point of draft) root.add(handleMesh(arrowWorldPoint(point, groundAt, state.defaults.heightM), handleRadius, false));
    }
    const selected = showing && state.active ? selectedArrow(state) : null;
    if (selected?.showIn3d) {
      selected.points.forEach((point, index) =>
        root.add(handleMesh(arrowWorldPoint(point, groundAt, selected.heightM), handleRadius, index === state.selectedPoint)),
      );
      if (!flat) {
        const middle = arrowMidpoint(selected.points);
        const gumball = arrowGumball(
          arrowWorldPoint(middle, groundAt, selected.heightM),
          groundAt(middle[0], middle[1]),
          model.sideM * GUMBALL_RADIUS_FRAC,
          getColour("--arrow-handle"),
        );
        markScreenOnly(gumball);
        markArrowEditor(gumball);
        root.add(gumball);
      }
    }
    invalidate();
  }, [root, arrows, state.draft, state.defaults, state.active, state.selectedId, state.selectedPoint, hover, showing, flat, model, groundAt, handleRadius, colourRevision, reducedMotion, invalidate]);

  useEffect(() => {
    if (!active || !state.active) {
      setHover(null);
      return;
    }
    let locked = false;
    const setLock = (next: boolean): void => {
      if (next === locked) return;
      locked = next;
      orbitLockRef.current?.(next);
    };
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    let lastClick: ClickStamp | null = null;
    let dragging: DragState | null = null;

    const rayAt = (event: PointerEvent): THREE.Ray => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray;
    };

    const screenPath = (arrow: Pick<DiagramArrow, "points" | "heightM">, rect: DOMRect): Pt[] =>
      smoothArrowPath(arrow.points).flatMap((point) => {
        const at = projectGroundPoint(camera, arrowWorldPoint(point, groundRef.current, arrow.heightM), rect);
        return at ? [at] : [];
      });

    const gumballWorld = (arrow: DiagramArrow): THREE.Vector3 =>
      arrowWorldPoint(arrowMidpoint(arrow.points), groundRef.current, arrow.heightM);

    const gumballAt = (event: PointerEvent): DiagramArrow | null => {
      const selected = selectedArrow(stateRef.current);
      if (!selected?.showIn3d || flatRef.current) return null;
      const rect = canvas.getBoundingClientRect();
      const local: Pt = [event.clientX - rect.left, event.clientY - rect.top];
      return gumballHit(camera, gumballWorld(selected), model.sideM * GUMBALL_RADIUS_FRAC, local, rect, GUMBALL_HIT_PX) ? selected : null;
    };

    const hitAt = (event: PointerEvent): { id: string; point: number | null } | null => {
      camera.updateMatrixWorld();
      const rect = canvas.getBoundingClientRect();
      const local: Pt = [event.clientX - rect.left, event.clientY - rect.top];
      const current = stateRef.current;
      const selected = selectedArrow(current);
      if (selected?.showIn3d) {
        const handles = selected.points.map((point) => projectGroundPoint(camera, arrowWorldPoint(point, groundRef.current, selected.heightM), rect) ?? [-1e6, -1e6]);
        const index = nearestPointIndex(handles as Pt[], local, HANDLE_HIT_PX);
        if (index !== null) return { id: selected.id, point: index };
      }
      let best: string | null = null;
      let bestPx = BODY_HIT_PX;
      for (const arrow of visibleIn3d(current.arrows)) {
        const d = distanceToPath(screenPath(arrow, rect), local);
        if (d <= bestPx) {
          bestPx = d;
          best = arrow.id;
        }
      }
      return best ? { id: best, point: null } : null;
    };

    const beginDrag = (event: PointerEvent, next: DragState): void => {
      dragging = next;
      setLock(true);
      canvas.setPointerCapture?.(event.pointerId);
      event.stopImmediatePropagation();
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
      const current = stateRef.current;
      if (current.draft) return;
      const hit = hitAt(event);
      const selected = selectedArrow(current);
      if (hit && hit.point !== null && selected && hit.id === selected.id) {
        dispatch({ type: "select", id: hit.id, point: hit.point });
        beginDrag(event, { kind: "point", id: hit.id, index: hit.point, heightM: selected.heightM });
        return;
      }
      const grabbed = gumballAt(event);
      if (!grabbed) return;
      const plane = gumballPlane(gumballWorld(grabbed), camera);
      const startY = plane ? gumballWorldY(rayAt(event), plane) : null;
      if (plane && startY !== null) beginDrag(event, { kind: "height", id: grabbed.id, plane, startY, startHeightM: grabbed.heightM });
    };

    const onMove = (event: PointerEvent) => {
      const current = stateRef.current;
      if (dragging?.kind === "point") {
        const ground = intersectArrowPlane(rayAt(event), groundRef.current, dragging.heightM);
        if (ground) dispatch({ type: "movePoint", id: dragging.id, index: dragging.index, point: ground });
        return;
      }
      if (dragging?.kind === "height") {
        const y = gumballWorldY(rayAt(event), dragging.plane);
        if (y !== null) dispatch({ type: "patch", patch: { heightM: clampArrowHeight(dragging.startHeightM + y - dragging.startY) } });
        return;
      }
      const overGumball = !current.draft && gumballAt(event) !== null;
      const overPoint = !current.draft && hitAt(event)?.point != null;
      canvas.style.cursor = overGumball ? "ns-resize" : "";
      setLock(overGumball || overPoint);
      if (current.draft && current.draft.length > 0) {
        setHover(intersectArrowPlane(rayAt(event), groundRef.current, current.defaults.heightM));
      } else {
        setHover(null);
      }
    };

    const onUp = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const start = down;
      down = null;
      if (dragging) {
        dragging = null;
        setLock(false);
        canvas.releasePointerCapture?.(event.pointerId);
        return;
      }
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_MAX_PX) return;
      const current = stateRef.current;
      const heightM = current.draft || !selectedArrow(current) ? current.defaults.heightM : selectedArrow(current)!.heightM;
      const ground = intersectArrowPlane(rayAt(event), groundRef.current, heightM);
      if (!ground) return;
      const stamp: ClickStamp = { t: event.timeStamp, x: event.clientX, y: event.clientY };
      const double = isDoubleClick(lastClick, stamp);
      lastClick = double ? null : stamp;
      const hit = current.draft ? null : hitAt(event);
      for (const action of arrowToolClickActions(current, { ground, hit }, double)) dispatch(action);
    };

    const onCancel = (event: PointerEvent) => {
      down = null;
      dragging = null;
      setLock(false);
      canvas.releasePointerCapture?.(event.pointerId);
    };

    canvas.addEventListener("pointerdown", onDown, { capture: true });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, { capture: true });
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      setLock(false);
      canvas.style.cursor = "";
    };
  }, [active, state.active, gl, camera, dispatch, model.sideM]);

  useFrame(() => {
    const live = liveRef.current;
    if (live.length === 0) return;
    const seconds = arrowClockSeconds();
    for (const item of live) updateLive(item, model, groundRef.current, seconds);
    invalidate();
  });

  return null;
}
