import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import {
  importedLabelAnchors,
  importedLabelOccluders,
  projectImportedLabels,
  type ImportedScreenLabel,
} from "../lib/importedLabels";
import { LANDMARK_LABEL_SETTLE_MS } from "../lib/landmarkLabels";

export type ImportedLabelState = { moving: boolean; labels: ImportedScreenLabel[] };

export function ImportedLabelProjector({
  group,
  enabled,
  onScreens,
}: {
  group: THREE.Object3D | null;
  enabled: boolean;
  onScreens: (state: ImportedLabelState | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const anchors = useMemo(() => importedLabelAnchors(group), [group]);
  const signature = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<ImportedScreenLabel[]>([]);
  const moving = useRef(false);
  const active = enabled && anchors.length > 0;

  const settle = () => {
    timer.current = null;
    moving.current = false;
    const occluders = importedLabelOccluders(scene.getObjectByName("CityCut") ?? null, group);
    last.current = projectImportedLabels(anchors, camera, gl.domElement.getBoundingClientRect(), occluders);
    onScreens({ moving: false, labels: last.current });
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(settle, LANDMARK_LABEL_SETTLE_MS);
  };

  useEffect(() => {
    if (!active) {
      last.current = [];
      onScreens(null);
      return;
    }
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [active, anchors]);

  useFrame(() => {
    if (!active) return;
    const next = `${camera.matrixWorld.elements.join(",")}|${camera.projectionMatrix.elements.join(",")}|${size.width}x${size.height}`;
    if (next === signature.current) return;
    signature.current = next;
    if (!moving.current) {
      moving.current = true;
      onScreens({ moving: true, labels: last.current });
    }
    schedule();
  });

  return null;
}
