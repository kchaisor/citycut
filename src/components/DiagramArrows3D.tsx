import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Pt, CityModel } from "../types";
import { getColour } from "../lib/colours";
import {
  ARROW_COLOUR_TOKENS,
  arrowLabelAnchor,
  buildArrowShape,
  distanceToPath,
  nearestPointIndex,
  smoothArrowPath,
  visibleIn3d,
  type DiagramArrow,
} from "../lib/diagramArrows";
import { arrowShapeGeometry, arrowWorldPoint, groundAtFor, intersectArrowPlane } from "../lib/diagramArrows3d";
import {
  arrowToolClickActions,
  isDoubleClick,
  selectedArrow,
  type ArrowToolAction,
  type ArrowToolState,
  type ClickStamp,
} from "../lib/diagramArrowsTool";
import { markScreenOnly } from "../lib/screenOnly";
import { useColourRevision } from "../lib/useColourRevision";

export type ArrowScreenLabel = { id: string; text: string; x: number; y: number };
export type ArrowExportLabels = (camera: THREE.Camera, width: number, height: number) => ArrowScreenLabel[];

const HANDLE_HIT_PX = 12;
const BODY_HIT_PX = 9;
const CLICK_MAX_PX = 5;
const LABEL_LIFT_PX = 16;
const HANDLE_SIDE_FRAC = 0.008;

function disposeGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    (mesh.material as THREE.Material | undefined)?.dispose();
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
  const material = new THREE.MeshBasicMaterial({
    color: getColour(ARROW_COLOUR_TOKENS[arrow.colour]),
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
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
  return mesh;
}

function projectPoint(camera: THREE.Camera, world: THREE.Vector3, rect: { width: number; height: number }): Pt | null {
  const ndc = world.clone().project(camera);
  if (ndc.z < -1 || ndc.z > 1) return null;
  return [(ndc.x * 0.5 + 0.5) * rect.width, (-ndc.y * 0.5 + 0.5) * rect.height];
}

export function DiagramArrows3D({
  model,
  state,
  dispatch,
  active,
  labelsRef,
  onLabels,
}: {
  model: CityModel;
  state: ArrowToolState;
  dispatch: Dispatch<ArrowToolAction>;
  active: boolean;
  labelsRef: MutableRefObject<ArrowExportLabels | null>;
  onLabels: (labels: ArrowScreenLabel[]) => void;
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
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
  const showing = state.visible && active;
  const arrows = useMemo(() => (showing ? visibleIn3d(state.arrows) : []), [showing, state.arrows]);
  const handleRadius = model.sideM * HANDLE_SIDE_FRAC;

  useLayoutEffect(() => {
    scene.add(root);
    return () => {
      scene.remove(root);
      disposeGroup(root);
    };
  }, [scene, root]);

  useLayoutEffect(() => {
    disposeGroup(root);
    for (const arrow of arrows) {
      const mesh = arrowMesh(arrow, model, groundAt, 1);
      if (mesh) root.add(mesh);
    }
    const draft = showing && state.active ? state.draft : null;
    if (draft) {
      const preview = hover ? [...draft, hover] : draft;
      const mesh = preview.length >= 2 ? arrowMesh({ ...state.defaults, points: preview }, model, groundAt, 0.65) : null;
      if (mesh) {
        markScreenOnly(mesh);
        root.add(mesh);
      }
      for (const point of draft) root.add(handleMesh(arrowWorldPoint(point, groundAt, state.defaults.heightM), handleRadius, false));
    }
    const selected = showing && state.active ? selectedArrow(state) : null;
    if (selected?.showIn3d) {
      selected.points.forEach((point, index) =>
        root.add(handleMesh(arrowWorldPoint(point, groundAt, selected.heightM), handleRadius, index === state.selectedPoint)),
      );
    }
    invalidate();
  }, [root, arrows, state.draft, state.defaults, state.active, state.selectedId, state.selectedPoint, hover, showing, model, groundAt, handleRadius, colourRevision, invalidate]);

  useEffect(() => {
    if (!active || !state.active) {
      setHover(null);
      return;
    }
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    let lastClick: ClickStamp | null = null;
    let dragging: { id: string; index: number; heightM: number } | null = null;

    const rayAt = (event: PointerEvent): THREE.Ray => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.ray;
    };

    const screenPath = (arrow: Pick<DiagramArrow, "points" | "heightM">, rect: DOMRect): Pt[] =>
      smoothArrowPath(arrow.points).flatMap((point) => {
        const at = projectPoint(camera, arrowWorldPoint(point, groundRef.current, arrow.heightM), rect);
        return at ? [at] : [];
      });

    const hitAt = (event: PointerEvent): { id: string; point: number | null } | null => {
      camera.updateMatrixWorld();
      const rect = canvas.getBoundingClientRect();
      const local: Pt = [event.clientX - rect.left, event.clientY - rect.top];
      const current = stateRef.current;
      const selected = selectedArrow(current);
      if (selected?.showIn3d) {
        const handles = selected.points.map((point) => projectPoint(camera, arrowWorldPoint(point, groundRef.current, selected.heightM), rect) ?? [-1e6, -1e6]);
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

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      down = { x: event.clientX, y: event.clientY };
      const current = stateRef.current;
      if (current.draft) return;
      const hit = hitAt(event);
      const selected = selectedArrow(current);
      if (hit && hit.point !== null && selected && hit.id === selected.id) {
        dragging = { id: hit.id, index: hit.point, heightM: selected.heightM };
        dispatch({ type: "select", id: hit.id, point: hit.point });
        canvas.setPointerCapture?.(event.pointerId);
        event.stopImmediatePropagation();
      }
    };

    const onMove = (event: PointerEvent) => {
      const current = stateRef.current;
      if (dragging) {
        const ground = intersectArrowPlane(rayAt(event), groundRef.current, dragging.heightM);
        if (ground) dispatch({ type: "movePoint", id: dragging.id, index: dragging.index, point: ground });
        return;
      }
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

    canvas.addEventListener("pointerdown", onDown, { capture: true });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, { capture: true });
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [active, state.active, gl, camera, dispatch]);

  const labelSignature = useRef("");
  const labelled = useMemo(() => arrows.filter((arrow) => arrow.label.trim() !== ""), [arrows]);

  const projectLabels = (cam: THREE.Camera, width: number, height: number, offsetX: number, offsetY: number): ArrowScreenLabel[] => {
    cam.updateMatrixWorld();
    const rect = { width, height };
    const out: ArrowScreenLabel[] = [];
    for (const arrow of labelled) {
      const anchor = arrowLabelAnchor(arrow.points);
      const at = projectPoint(cam, arrowWorldPoint(anchor, groundRef.current, arrow.heightM), rect);
      if (!at || at[0] < 0 || at[0] > width || at[1] < 0 || at[1] > height) continue;
      out.push({ id: arrow.id, text: arrow.label.trim(), x: offsetX + at[0], y: offsetY + at[1] - LABEL_LIFT_PX });
    }
    return out;
  };

  useEffect(() => {
    if (labelled.length === 0) {
      labelsRef.current = null;
      labelSignature.current = "";
      onLabels([]);
      return;
    }
    labelsRef.current = (exportCamera, width, height) => projectLabels(exportCamera, width, height, 0, 0);
    labelSignature.current = "";
    return () => {
      labelsRef.current = null;
    };
  }, [labelled]);

  useFrame(() => {
    if (labelled.length === 0) return;
    const signature = `${camera.matrixWorld.elements.join(",")}|${camera.projectionMatrix.elements.join(",")}|${size.width}x${size.height}|${labelled.map((a) => a.id + a.label + a.heightM + a.points.join(";")).join("|")}`;
    if (signature === labelSignature.current) return;
    labelSignature.current = signature;
    const rect = gl.domElement.getBoundingClientRect();
    onLabels(projectLabels(camera, rect.width, rect.height, rect.left, rect.top));
  });

  return null;
}
