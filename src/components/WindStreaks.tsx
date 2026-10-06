import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { getColour } from "../lib/colours";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import { useColourRevision } from "../lib/useColourRevision";
import type { TerrainField } from "../types";
import {
  arrowHeadTriangle,
  buildWindArrowBuffer,
  stepWindArrowDrift,
  windArrowHeadPositionsMetres,
  windStreakSpeedMs,
  writeHeadPositions,
  writeLinePositions,
  type WindArrowBuffer,
  type WindArrowCurve,
} from "../lib/windArrowGeometry";
import type { WindPeriodStats } from "../lib/windRose";

declare global {
  interface Window {
    __citycutQaWind?: {
      getHeadPositionsM: () => { east: number; north: number; y: number; opacity: number }[];
    };
  }
}

type ArrowObjects = {
  line: Line2;
  head: THREE.Mesh;
  lineMaterial: LineMaterial;
  headMaterial: THREE.MeshBasicMaterial;
  curve: WindArrowCurve;
};

function buildArrowObjects(curve: WindArrowCurve, colourTick: number): ArrowObjects {
  const color = new THREE.Color(getColour("--wind-streak"));
  const lineMaterial = new LineMaterial({
    color: color.getHex(),
    linewidth: 4,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false,
    worldUnits: false,
    dashed: false,
  });

  const headMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions(curve.positions);
  const line = new Line2(lineGeometry, lineMaterial);
  line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = 900;

  const tri = arrowHeadTriangle(curve);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute("position", new THREE.BufferAttribute(tri.positions, 3));
  headGeometry.setIndex([0, 1, 2]);
  headGeometry.computeVertexNormals();
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.frustumCulled = false;
  head.renderOrder = 903;

  void colourTick;
  return { line, head, lineMaterial, headMaterial, curve };
}

function WindArrowsInner({
  buffer,
  stats,
  animate,
}: {
  buffer: WindArrowBuffer;
  stats: WindPeriodStats;
  animate: boolean;
}) {
  const colourTick = useColourRevision();
  const { size } = useThree();
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;

  const arrows = useMemo(
    () => buffer.curves.map((curve) => buildArrowObjects(curve, colourTick)),
    [buffer.curves, colourTick],
  );

  useEffect(() => {
    for (const arrow of arrows) {
      arrow.lineMaterial.resolution.set(size.width, size.height);
    }
  }, [arrows, size.width, size.height]);

  useEffect(
    () => () => {
      for (const arrow of arrows) {
        arrow.lineMaterial.dispose();
        arrow.headMaterial.dispose();
        arrow.line.geometry.dispose();
        arrow.head.geometry.dispose();
      }
    },
    [arrows],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    window.__citycutQaWind = {
      getHeadPositionsM: () => windArrowHeadPositionsMetres(bufferRef.current),
    };
    return () => {
      delete window.__citycutQaWind;
    };
  }, []);

  useFrame((_, delta) => {
    if (!animate) return;
    const dt = Math.min(delta, 0.05);
    const speed = windStreakSpeedMs(buffer.sideM, stats.prevailingMedianKmh);
    stepWindArrowDrift(buffer, stats.prevailingSector, dt, speed);

    for (const arrow of arrows) {
      const { curve } = arrow;
      writeLinePositions(arrow.line.geometry, curve.positions);
      const tri = arrowHeadTriangle(curve);
      writeHeadPositions(arrow.head.geometry, tri);
      const edge = curve.opacity;
      arrow.lineMaterial.opacity = 0.55 * edge;
      arrow.headMaterial.opacity = 0.92 * edge;
    }
  });

  return (
    <>
      {arrows.flatMap((arrow, index) => [
        <primitive key={`l-${index}`} object={arrow.line} />,
        <primitive key={`h-${index}`} object={arrow.head} />,
      ])}
    </>
  );
}

export function WindStreaks({
  sideM,
  stats,
  animate,
  terrain,
}: {
  sideM: number;
  stats: WindPeriodStats;
  animate: boolean;
  terrain?: TerrainField | null;
}) {
  const buffer = useMemo(
    () => buildWindArrowBuffer(sideM, stats.prevailingSector, terrain),
    [sideM, stats.prevailingSector, terrain],
  );
  return <WindArrowsInner buffer={buffer} stats={stats} animate={animate} />;
}

export function WindStaticArrows({
  sideM,
  stats,
  terrain,
}: {
  sideM: number;
  stats: WindPeriodStats;
  terrain?: TerrainField | null;
}) {
  return <WindStreaks sideM={sideM} stats={stats} animate={false} terrain={terrain} />;
}
