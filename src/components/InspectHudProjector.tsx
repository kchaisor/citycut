import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { SceneInspectWorld } from "../lib/sceneInspectPick";

export type InspectHudScreen = {
  clientX: number;
  clientY: number;
  inView: boolean;
};

export function InspectHudProjector({
  world,
  enabled,
  onScreen,
}: {
  world: SceneInspectWorld | null;
  enabled: boolean;
  onScreen: (screen: InspectHudScreen | null) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!enabled || !world) {
      onScreen(null);
      return;
    }
    point.set(world.east, world.up, -world.north);
    point.project(camera);
    const inView = point.z > -1 && point.z < 1 && Math.abs(point.x) <= 1.05 && Math.abs(point.y) <= 1.05;
    const canvasX = (point.x * 0.5 + 0.5) * size.width;
    const canvasY = (-point.y * 0.5 + 0.5) * size.height;
    const rect = gl.domElement.getBoundingClientRect();
    onScreen({
      clientX: rect.left + canvasX,
      clientY: rect.top + canvasY,
      inView,
    });
  });
  return null;
}
