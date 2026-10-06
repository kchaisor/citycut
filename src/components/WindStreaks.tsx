import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { TerrainField } from "../types";
import {
  arrowHeadSegmentPositions,
  buildWindArrowBuffer,
  updateWindArrowDashOffset,
  type WindArrowBuffer,
  type WindArrowCurve,
} from "../lib/windArrowGeometry";
import type { WindPeriodStats } from "../lib/windRose";

function curveLine(curve: WindArrowCurve, material: LineMaterial): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(curve.positions);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.frustumCulled = false;
  line.renderOrder = 900;
  return line;
}

function headLines(curve: WindArrowCurve, sideM: number, material: LineMaterial): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(arrowHeadSegmentPositions(curve, sideM));
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 901;
  return lines;
}

function WindArrowsInner({
  buffer,
  animate,
  sideM,
}: {
  buffer: WindArrowBuffer;
  animate: boolean;
  sideM: number;
}) {
  const colourTick = useColourRevision();
  const { size } = useThree();
  const timeRef = useRef(0);

  const pathMaterial = useMemo(() => {
    const color = new THREE.Color(getColour("--wind-streak"));
    return new LineMaterial({
      color: color.getHex(),
      linewidth: 3.2,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
      worldUnits: false,
      dashed: true,
      dashSize: 0.35,
      gapSize: 0.22,
    });
  }, [colourTick]);

  const headMaterial = useMemo(
    () =>
      new LineMaterial({
        color: new THREE.Color(getColour("--wind-streak")).getHex(),
        linewidth: 3.5,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
        worldUnits: false,
      }),
    [colourTick],
  );

  const objects = useMemo(() => {
    const root: THREE.Object3D[] = [];
    for (const curve of buffer.curves) {
      root.push(curveLine(curve, pathMaterial));
      root.push(headLines(curve, sideM, headMaterial));
    }
    return root;
  }, [buffer, pathMaterial, headMaterial, sideM]);

  useEffect(() => {
    pathMaterial.resolution.set(size.width, size.height);
    headMaterial.resolution.set(size.width, size.height);
  }, [headMaterial, pathMaterial, size.width, size.height]);

  useEffect(
    () => () => {
      pathMaterial.dispose();
      headMaterial.dispose();
      for (const object of objects) {
        (object as Line2).geometry.dispose();
      }
    },
    [objects, headMaterial, pathMaterial],
  );

  useFrame((_, delta) => {
    if (!animate) {
      pathMaterial.dashOffset = 0;
      return;
    }
    timeRef.current += delta;
    updateWindArrowDashOffset(pathMaterial, timeRef.current, buffer.curves[0]?.phase ?? 0);
  });

  return (
    <>
      {objects.map((object, index) => (
        <primitive key={index} object={object} />
      ))}
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
  return <WindArrowsInner buffer={buffer} animate={animate} sideM={sideM} />;
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
