import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { TerrainField } from "../types";
import {
  buildWindStreakBuffer,
  updateWindStreakPositions,
  windStreakSpeedMs,
  writeLineSegmentPositions,
  type WindStreakBuffer,
} from "../lib/windStreakGeometry";
import type { WindPeriodStats } from "../lib/windRose";

function streakLines(buffer: WindStreakBuffer, material: LineMaterial): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(buffer.positions);
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 900;
  return lines;
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
  const colourTick = useColourRevision();
  const { size } = useThree();
  const timeRef = useRef(0);
  const buffer = useMemo(
    () => buildWindStreakBuffer(sideM, stats.prevailingSector, terrain),
    [sideM, stats.prevailingSector, terrain],
  );

  const material = useMemo(() => {
    const color = new THREE.Color(getColour("--wind-streak"));
    return new LineMaterial({
      color: color.getHex(),
      linewidth: 2.8,
      transparent: true,
      opacity: 0.7,
      depthTest: true,
      depthWrite: false,
      worldUnits: false,
    });
  }, [colourTick]);

  const lines = useMemo(() => streakLines(buffer, material), [buffer, material]);

  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [material, size.width, size.height]);

  useEffect(
    () => () => {
      lines.geometry.dispose();
      material.dispose();
    },
    [lines, material],
  );

  useFrame((_, delta) => {
    if (!animate) return;
    timeRef.current += delta;
    const speed = windStreakSpeedMs(sideM, stats.prevailingMedianKmh);
    updateWindStreakPositions(buffer, stats.prevailingSector, timeRef.current, speed);
    writeLineSegmentPositions(lines.geometry, buffer.positions);
  });

  return <primitive object={lines} />;
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
  const colourTick = useColourRevision();
  const { size } = useThree();
  const buffer = useMemo(
    () => buildWindStreakBuffer(Math.min(sideM, 800), stats.prevailingSector, terrain),
    [sideM, stats.prevailingSector, terrain, colourTick],
  );

  const material = useMemo(
    () =>
      new LineMaterial({
        color: new THREE.Color(getColour("--wind-streak")).getHex(),
        linewidth: 2.5,
        transparent: true,
        opacity: 0.7,
        depthTest: true,
        depthWrite: false,
      }),
    [colourTick],
  );

  const lines = useMemo(() => streakLines(buffer, material), [buffer, material]);

  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [material, size.width, size.height]);

  useEffect(
    () => () => {
      lines.geometry.dispose();
      material.dispose();
    },
    [lines, material],
  );

  return <primitive object={lines} />;
}
