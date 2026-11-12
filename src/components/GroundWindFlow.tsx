import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import type { CityModel } from "../types";
import {
  buildGroundWindParticles,
  groundWindBaseVector,
  groundWindHeightAt,
  GROUND_WIND_LOOP_SEC,
  groundWindVectorAt,
  type GroundWindParticle,
} from "../lib/groundWindField";
import { buildingBlocks } from "../lib/groundWindField";
import type { WindPeriodStats } from "../lib/windRose";

function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GroundWindFlow({
  model,
  stats,
  animate,
}: {
  model: CityModel;
  stats: WindPeriodStats | null;
  animate: boolean;
}) {
  const particles = useMemo(() => buildGroundWindParticles(model, stats), [model, stats]);
  const blocks = useMemo(() => buildingBlocks(model), [model]);
  const base = useMemo(() => groundWindBaseVector(stats), [stats]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const phase = useRef(0);
  const color = useMemo(() => new THREE.Color(getColour("--ground-wind-glyph")), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(2.4, 0.55), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [color],
  );
  const reduced = reducedMotionPreferred();
  const active = animate && !reduced;
  const invalidate = useThree((state) => state.invalidate);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (active) phase.current = (phase.current + delta) % GROUND_WIND_LOOP_SEC;
    const t = phase.current / GROUND_WIND_LOOP_SEC;
    const half = model.sideM / 2;
    particles.forEach((particle: GroundWindParticle, index) => {
      const travel = ((t + particle.phase) % 1) * model.sideM * 0.95;
      const startE = particle.east;
      const startN = particle.north;
      const flow = groundWindVectorAt(startE, startN, model, blocks, base);
      const east = startE + flow.east * travel * particle.speed;
      const north = startN + flow.north * travel * particle.speed;
      const wrappedE = east > half ? east - model.sideM : east < -half ? east + model.sideM : east;
      const wrappedN = north > half ? north - model.sideM : north < -half ? north + model.sideM : north;
      const y = groundWindHeightAt(model, wrappedE, wrappedN);
      const angle = Math.atan2(flow.east, flow.north);
      scratch.position.set(wrappedE, y, -wrappedN);
      scratch.rotation.set(-Math.PI / 2, 0, -angle);
      const fade = 0.35 + 0.65 * Math.sin((t + particle.phase) * Math.PI * 2);
      scratch.scale.set(1, fade, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = active ? 0.82 : 0.55;
    invalidate();
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, particles.length]}
      frustumCulled={false}
      renderOrder={880}
    />
  );
}
