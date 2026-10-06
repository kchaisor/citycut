import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { TerrainField } from "../types";
import {
  arrowHeadTriangle,
  buildWindArrowBuffer,
  updateWindArrowDashOffset,
  type WindArrowBuffer,
  type WindArrowCurve,
} from "../lib/windArrowGeometry";
import type { WindPeriodStats } from "../lib/windRose";

type ArrowObjects = {
  base: Line2;
  flow: Line2;
  head: THREE.Mesh;
  curve: WindArrowCurve;
};

function buildArrowObjects(
  curve: WindArrowCurve,
  baseMaterial: LineMaterial,
  flowMaterial: LineMaterial,
  headMaterial: THREE.MeshBasicMaterial,
): ArrowObjects {
  const baseGeometry = new LineGeometry();
  baseGeometry.setPositions(curve.positions);
  const base = new Line2(baseGeometry, baseMaterial);
  base.computeLineDistances();
  base.frustumCulled = false;
  base.renderOrder = 900;

  const flowGeometry = new LineGeometry();
  flowGeometry.setPositions(curve.positions);
  const flow = new Line2(flowGeometry, flowMaterial);
  flow.computeLineDistances();
  flow.frustumCulled = false;
  flow.renderOrder = 902;

  const tri = arrowHeadTriangle(curve);
  const headGeometry = new THREE.BufferGeometry();
  headGeometry.setAttribute("position", new THREE.BufferAttribute(tri.positions, 3));
  headGeometry.setIndex([0, 1, 2]);
  headGeometry.computeVertexNormals();
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.frustumCulled = false;
  head.renderOrder = 903;

  return { base, flow, head, curve };
}

function WindArrowsInner({
  buffer,
  animate,
}: {
  buffer: WindArrowBuffer;
  animate: boolean;
}) {
  const colourTick = useColourRevision();
  const { size } = useThree();
  const timeRef = useRef(0);

  const baseMaterial = useMemo(() => {
    const color = new THREE.Color(getColour("--wind-streak"));
    return new LineMaterial({
      color: color.getHex(),
      linewidth: 4,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
      depthWrite: false,
      worldUnits: false,
      dashed: false,
    });
  }, [colourTick]);

  const flowMaterials = useMemo(() => {
    const color = new THREE.Color(getColour("--wind-streak"));
    return buffer.curves.map((curve) => {
      const pulse = curve.pathLenM * 0.22;
      const gap = Math.max(curve.pathLenM * 0.78, pulse * 2);
      return new LineMaterial({
        color: color.getHex(),
        linewidth: 5.5,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        worldUnits: true,
        dashed: true,
        dashSize: pulse,
        gapSize: gap,
        dashOffset: 0,
      });
    });
  }, [buffer.curves, colourTick]);

  const headMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(getColour("--wind-streak")),
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [colourTick],
  );

  const arrows = useMemo(
    () =>
      buffer.curves.map((curve, index) =>
        buildArrowObjects(curve, baseMaterial, flowMaterials[index]!, headMaterial),
      ),
    [baseMaterial, buffer.curves, flowMaterials, headMaterial],
  );

  useEffect(() => {
    baseMaterial.resolution.set(size.width, size.height);
    for (const material of flowMaterials) {
      material.resolution.set(size.width, size.height);
    }
  }, [baseMaterial, flowMaterials, size.width, size.height]);

  useEffect(
    () => () => {
      baseMaterial.dispose();
      for (const material of flowMaterials) material.dispose();
      headMaterial.dispose();
      for (const arrow of arrows) {
        arrow.base.geometry.dispose();
        arrow.flow.geometry.dispose();
        arrow.head.geometry.dispose();
      }
    },
    [arrows, baseMaterial, flowMaterials, headMaterial],
  );

  useFrame((_, delta) => {
    if (!animate) {
      for (const material of flowMaterials) material.dashOffset = 0;
      return;
    }
    timeRef.current += delta;
    for (let i = 0; i < arrows.length; i++) {
      const { curve } = arrows[i]!;
      updateWindArrowDashOffset(flowMaterials[i]!, timeRef.current, curve.phase, curve.pathLenM);
    }
  });

  return (
    <>
      {arrows.flatMap((arrow, index) => [
        <primitive key={`b-${index}`} object={arrow.base} />,
        animate ? <primitive key={`f-${index}`} object={arrow.flow} /> : null,
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
  return <WindArrowsInner buffer={buffer} animate={animate} />;
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
