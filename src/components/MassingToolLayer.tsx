import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityModel } from "../types";
import { attachMassingGroundPick, attachMassingHeightDrag } from "../lib/massingBlockPick";
import {
  MASSING_BLOCK_GROUP,
  buildMassingBlockMesh,
  buildMassingBlockSelectionOutline,
  buildMassingFloorGuides,
  buildMassingHeightHandle,
  buildMassingPreviewMesh,
} from "../lib/massingBlockMesh";
import { disposeObject } from "../lib/buildCity";
import { snapFloorsFromHeight, type MassingBlock } from "../lib/massingBlock";
import type { MassingToolState } from "../lib/massingToolMachine";
import type { Ring } from "../types";

type Props = {
  model: CityModel;
  blocks: MassingBlock[];
  tool: MassingToolState;
  previewRing: Ring | null;
  active: boolean;
  onPointerDown: (east: number, north: number, hitBlockId: string | null) => void;
  onPointerMove: (east: number, north: number, clientX: number, clientY: number) => void;
  onPointerUp: () => void;
  onCancel: () => void;
  onHeightDragStart: (blockId: string) => void;
  onHeightDrag: (clientY: number, startY: number) => void;
  onHeightDragEnd: () => void;
};

export function MassingToolLayer({
  model,
  blocks,
  tool,
  previewRing,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onCancel,
  onHeightDragStart,
  onHeightDrag,
  onHeightDragEnd,
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

  useLayoutEffect(() => {
    if (!active) return;
    return attachMassingGroundPick(gl.domElement, camera, scene, {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onCancel,
    }, true);
  }, [active, camera, gl.domElement, onCancel, onPointerDown, onPointerMove, onPointerUp, scene]);

  const onHeightStart = useCallback(
    (blockId: string) => {
      heightDragStartY.current = null;
      onHeightDragStart(blockId);
    },
    [onHeightDragStart],
  );

  const onHeightMove = useCallback(
    (clientY: number) => {
      if (heightDragStartY.current == null) heightDragStartY.current = clientY;
      onHeightDrag(clientY, heightDragStartY.current);
    },
    [onHeightDrag],
  );

  const onHeightEnd = useCallback(() => {
    heightDragStartY.current = null;
    onHeightDragEnd();
  }, [onHeightDragEnd]);

  useLayoutEffect(() => {
    if (!active || tool.phase !== "selected") return;
    return attachMassingHeightDrag(
      gl.domElement,
      camera,
      scene,
      { onStart: onHeightStart, onMove: onHeightMove, onEnd: onHeightEnd },
      true,
    );
  }, [active, camera, gl.domElement, onHeightEnd, onHeightMove, onHeightStart, scene, tool.phase]);

  useEffect(() => {
    invalidate();
  }, [blocks, invalidate, overlay, previewMesh, tool]);

  return (
    <group ref={groupRef}>
      {blockGroup ? <primitive object={blockGroup} /> : null}
      {overlay ? <primitive object={overlay} /> : null}
      {previewMesh ? <primitive object={previewMesh} /> : null}
    </group>
  );
}

export function floorsFromHeightDrag(deltaPx: number, startFloors: number, floorHeightM: number): number {
  const floorsDelta = Math.round(-deltaPx / 24);
  return snapFloorsFromHeight(Math.max(floorHeightM, (startFloors + floorsDelta) * floorHeightM), floorHeightM);
}
