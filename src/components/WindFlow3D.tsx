import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { TerrainField } from "../types";
import {
  buildHeatmapTerrainMesh,
  fillWindFlowLineBuffers,
  windFlowTrailSegmentCapM,
} from "../lib/windLbm/windFlow3dGeometry";
import type { WindLbmSolverState } from "../lib/windLbm/types";
import type { WindFlowParticle } from "../lib/windLbm/windParticles";

declare global {
  interface Window {
    __citycutQaWind3d?: {
      getStats: () => { lineVerts: number; fps: number; frame: number };
    };
  }
}

const MAX_LINE_VERTS = 2800 * 10 * 2;

export function WindFlow3D({
  sideM,
  terrain,
  plinthBottomY,
  particles,
  solver,
  frame,
  showHeatmap,
  normSpeed,
  flowReveal,
  playing,
}: {
  sideM: number;
  terrain?: TerrainField | null;
  plinthBottomY: number;
  particles: readonly WindFlowParticle[];
  solver: WindLbmSolverState | null;
  frame: number;
  showHeatmap: boolean;
  normSpeed: number;
  flowReveal: number;
  playing: boolean;
}) {
  const colourTick = useColourRevision();
  const heatCalm = useMemo(() => getColour("--wind-flow-heatmap-calm"), [colourTick]);
  const heatFast = useMemo(() => getColour("--wind-flow-heatmap-fast"), [colourTick]);
  const half = sideM / 2;

  const linePositions = useMemo(() => new Float32Array(MAX_LINE_VERTS * 3), []);
  const lineColors = useMemo(() => new Float32Array(MAX_LINE_VERTS * 3), []);

  const lineGeo = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    return geometry;
  }, [lineColors, linePositions]);

  const lineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  const lines = useMemo(() => {
    const mesh = new THREE.LineSegments(lineGeo, lineMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 920;
    return mesh;
  }, [lineGeo, lineMaterial]);

  const heatmapGroup = useRef<THREE.Group>(null);
  const lineVertsRef = useRef(0);
  const fpsRef = useRef(60);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(
    () => () => {
      lineGeo.dispose();
      lineMaterial.dispose();
    },
    [lineGeo, lineMaterial],
  );

  useLayoutEffect(() => {
    const group = heatmapGroup.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
    if (!solver || !showHeatmap) return;
    const mesh = buildHeatmapTerrainMesh(solver, sideM, terrain, plinthBottomY, heatCalm, heatFast);
    group.add(mesh);
  }, [solver, showHeatmap, sideM, terrain, plinthBottomY, heatCalm, heatFast, normSpeed, frame]);

  const invalidate = useThree((state) => state.invalidate);
  const lastFpsTick = useRef(performance.now());
  const fpsSamples = useRef<number[]>([]);

  const syncLines = () => {
    if (flowReveal < 0.02 || !solver) {
      lineVertsRef.current = 0;
      lineGeo.setDrawRange(0, 0);
      return;
    }
    const cap = windFlowTrailSegmentCapM(solver, sideM);
    const verts = fillWindFlowLineBuffers(
      particles,
      half,
      sideM,
      terrain,
      plinthBottomY,
      cap,
      normSpeed,
      flowReveal,
      heatCalm,
      heatFast,
      linePositions,
      lineColors,
    );
    lineVertsRef.current = verts;
    lineGeo.setDrawRange(0, verts);
    (lineGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    invalidate();
  };

  useLayoutEffect(() => {
    syncLines();
  }, [particles, frame, flowReveal, normSpeed, solver, sideM, heatCalm, heatFast]);

  useFrame(() => {
    if (!playing) return;
    syncLines();
    const now = performance.now();
    const dt = now - lastFpsTick.current;
    lastFpsTick.current = now;
    if (dt > 0) {
      fpsSamples.current.push(1000 / dt);
      if (fpsSamples.current.length > 24) fpsSamples.current.shift();
      fpsRef.current = fpsSamples.current.reduce((a, v) => a + v, 0) / fpsSamples.current.length;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__citycutQaWind3d = {
      getStats: () => ({
        lineVerts: lineVertsRef.current,
        fps: fpsRef.current,
        frame: frameRef.current,
      }),
    };
    return () => {
      delete window.__citycutQaWind3d;
    };
  }, []);

  return (
    <group name="wind-flow-3d">
      <primitive object={lines} />
      <group ref={heatmapGroup} />
    </group>
  );
}
