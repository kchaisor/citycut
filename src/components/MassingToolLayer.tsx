import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CityModel } from "../types";
import { attachMassingGroundPick, attachMassingHeightDrag } from "../lib/massingBlockPick";
import {
  MASSING_BLOCK_GROUP,
  buildMassingBlockMesh,
  buildMassingBlockSelectionOutline,
  buildMassingFloorGuides,
  buildMassingHeightHandle,
  buildMassingPreviewLine,
  buildMassingPreviewMesh,
} from "../lib/massingBlockMesh";
import { disposeObject } from "../lib/buildCity";
import { snapFloorsFromHeight, type MassingBlock } from "../lib/massingBlock";
import type { MassingToolState } from "../lib/massingToolMachine";
import type { Ring } from "../types";

declare global {
  interface Window {
    __citycutQaMassingPreview?: {
      phase: string;
      start: [number, number];
      end: [number, number];
      inScene: boolean;
    } | null;
  }
}

type Props = {
  model: CityModel;
  blocks: MassingBlock[];
  tool: MassingToolState;
  previewRing: Ring | null;
  previewLine: readonly [[number, number], [number, number]] | null;
  active: boolean;
  onPointerDown: (east: number, north: number, hitBlockId: string | null) => void;
  onPointerMove: (east: number, north: number, clientX: number, clientY: number) => void;
  onPointerUp: () => void;
  onCancel: () => void;
  onHeightDragStart: (blockId: string) => void;
  onHeightDrag: (clientY: number, startY: number) => void;
  onHeightDragEnd: () => void;
  parcelOutlineObjects: THREE.Object3D[];
  parcelOutlineLineMaterials: LineMaterial[];
};

function MassingParcelLineResolution({ materials }: { materials: LineMaterial[] }) {
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = size.width * dpr;
    const h = size.height * dpr;
    for (const material of materials) material.resolution.set(w, h);
  }, [gl, materials, size.height, size.width]);
  return null;
}

export function MassingToolLayer({
  model,
  blocks,
  tool,
  previewRing,
  previewLine,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onCancel,
  onHeightDragStart,
  onHeightDrag,
  onHeightDragEnd,
  parcelOutlineObjects,
  parcelOutlineLineMaterials,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const heightDragStartY = useRef<number | null>(null);
  const [blockGroup, setBlockGroup] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const group = new THREE.Group();
    group.name = MASSING_BLOCK_GROUP;
    for (const block of blocks) {
      const mesh = buildMassingBlockMesh(model, block);
      if (mesh) group.add(mesh);
    }
    setBlockGroup(group);
    return () => {
      disposeObject(group);
      setBlockGroup(null);
    };
  }, [blocks, model]);

  const overlay = useMemo(() => {
    if (!tool.selectedId) return null;
    const block = blocks.find((item) => item.id === tool.selectedId);
    if (!block) return null;
    const g = new THREE.Group();
    g.name = "MassingSelectionOverlay";
    const outline = buildMassingBlockSelectionOutline(model, block);
    if (outline) g.add(outline);
    if (tool.phase === "selected" || tool.phase === "draggingHeight") {
      g.add(buildMassingFloorGuides(model, block));
      g.add(buildMassingHeightHandle(model, block));
    }
    return g;
  }, [blocks, model, tool.phase, tool.selectedId]);

  useEffect(() => {
    return () => {
      if (overlay) disposeObject(overlay);
    };
  }, [overlay]);

  const previewMesh = useMemo(() => {
    if (!previewRing) return null;
    return buildMassingPreviewMesh(model, previewRing);
  }, [model, previewRing]);

  const previewLineObj = useMemo(() => {
    if (!previewLine) return null;
    return buildMassingPreviewLine(model, previewLine);
  }, [model, previewLine]);

  useEffect(() => {
    window.__citycutQaMassingPreview = previewLine
      ? { phase: tool.phase, start: previewLine[0], end: previewLine[1], inScene: previewLineObj != null }
      : null;
    return () => {
      if (previewLineObj) disposeObject(previewLineObj);
    };
  }, [previewLine, previewLineObj, tool.phase]);

  // Parent passes inline callbacks that change every render. Keep them in refs so the
  // canvas listeners attach once per drag surface; re-attaching mid-gesture resets the
  // listener's `dragging` flag and drops every pointermove (zero-length draw, no block).
  const groundHandlers = useRef({ onPointerDown, onPointerMove, onPointerUp, onCancel });
  groundHandlers.current = { onPointerDown, onPointerMove, onPointerUp, onCancel };
  const hoverRef = useRef(false);
  hoverRef.current = tool.drawArmed && tool.phase === "drawingPreview";
  const heightHandlers = useRef({ onHeightDragStart, onHeightDrag, onHeightDragEnd });
  heightHandlers.current = { onHeightDragStart, onHeightDrag, onHeightDragEnd };

  useLayoutEffect(() => {
    if (!active) return;
    return attachMassingGroundPick(
      gl.domElement,
      camera,
      scene,
      {
        onPointerDown: (east, north, hitBlockId) => groundHandlers.current.onPointerDown(east, north, hitBlockId),
        onPointerMove: (east, north, clientX, clientY) => groundHandlers.current.onPointerMove(east, north, clientX, clientY),
        onPointerUp: () => groundHandlers.current.onPointerUp(),
        onCancel: () => groundHandlers.current.onCancel(),
        hoverActive: () => hoverRef.current,
      },
      true,
    );
  }, [active, camera, gl.domElement, scene]);

  const heightActive = active && (tool.phase === "selected" || tool.phase === "draggingHeight");
  useLayoutEffect(() => {
    if (!heightActive) return;
    return attachMassingHeightDrag(
      gl.domElement,
      camera,
      scene,
      {
        onStart: (blockId: string) => {
          heightDragStartY.current = null;
          heightHandlers.current.onHeightDragStart(blockId);
        },
        onMove: (clientY: number) => {
          if (heightDragStartY.current == null) heightDragStartY.current = clientY;
          heightHandlers.current.onHeightDrag(clientY, heightDragStartY.current);
        },
        onEnd: () => {
          heightDragStartY.current = null;
          heightHandlers.current.onHeightDragEnd();
        },
      },
      true,
    );
  }, [heightActive, camera, gl.domElement, scene]);

  useEffect(() => {
    invalidate();
  }, [blocks, invalidate, overlay, parcelOutlineObjects, previewMesh, previewLineObj, tool]);

  useEffect(() => {
    return () => {
      for (const object of parcelOutlineObjects) disposeObject(object);
    };
  }, [parcelOutlineObjects]);

  return (
    <group ref={groupRef}>
      {parcelOutlineLineMaterials.length ? (
        <MassingParcelLineResolution materials={parcelOutlineLineMaterials} />
      ) : null}
      {blockGroup ? <primitive object={blockGroup} /> : null}
      {parcelOutlineObjects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
      {overlay ? <primitive object={overlay} /> : null}
      {previewMesh ? <primitive object={previewMesh} /> : null}
      {previewLineObj ? <primitive object={previewLineObj} /> : null}
    </group>
  );
}

export function floorsFromHeightDrag(deltaPx: number, startFloors: number, floorHeightM: number): number {
  const floorsDelta = Math.round(-deltaPx / 24);
  return snapFloorsFromHeight(Math.max(floorHeightM, (startFloors + floorsDelta) * floorHeightM), floorHeightM);
}
