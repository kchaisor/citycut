import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityModel } from "../types";
import {
  buildGroundWindParticles,
  groundWindBaseVector,
  groundWindGlyphScaleM,
  groundWindHeightAt,
  GROUND_WIND_LOOP_SEC,
  groundWindVectorAt,
  type GroundWindParticle,
} from "../lib/groundWindField";
import { buildingBlocks } from "../lib/groundWindField";
import { bakeGroundWindGlyphTexture } from "../lib/groundWindGlyph";
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
  primaryView?: boolean;
}) {
  const particles = useMemo(() => buildGroundWindParticles(model, stats), [model, stats]);
  const blocks = useMemo(() => buildingBlocks(model), [model]);
  const base = useMemo(() => groundWindBaseVector(stats), [stats]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const phase = useRef(0);
  const { length, width } = useMemo(() => groundWindGlyphScaleM(model.sideM), [model.sideM]);
  const map = useMemo(() => bakeGroundWindGlyphTexture(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(length, width), [length, width]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [map],
  );
  const reduced = reducedMotionPreferred();
  const active = animate && !reduced;
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);
  const flowAxis = useMemo(() => new THREE.Vector3(), []);
  const viewDir = useMemo(() => new THREE.Vector3(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
    [geometry, material, map],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (active) phase.current = (phase.current + delta) % GROUND_WIND_LOOP_SEC;
    const t = phase.current / GROUND_WIND_LOOP_SEC;
    const half = model.sideM / 2;
    particles.forEach((particle: GroundWindParticle, index) => {
      const travel = ((t + particle.phase) % 1) * model.sideM * particle.lane;
      const startE = particle.east;
      const startN = particle.north;
      const flow = groundWindVectorAt(startE, startN, model, blocks, base);
      const east = startE + flow.east * travel * particle.speed;
      const north = startN + flow.north * travel * particle.speed;
      const wrappedE = east > half ? east - model.sideM : east < -half ? east + model.sideM : east;
      const wrappedN = north > half ? north - model.sideM : north < -half ? north + model.sideM : north;
      const y = groundWindHeightAt(model, wrappedE, wrappedN);
      flowAxis.set(flow.east, 0, -flow.north).normalize();
      const yaw = Math.atan2(flowAxis.x, flowAxis.z);
      scratch.position.set(wrappedE, y, -wrappedN);
      scratch.rotation.set(-Math.PI / 2, 0, yaw);
      viewDir.copy(camera.position).sub(scratch.position);
      viewDir.y = 0;
      if (viewDir.lengthSq() > 1e-6) {
        const tilt = Math.atan2(viewDir.x, viewDir.z) - yaw;
        scratch.rotation.z = THREE.MathUtils.clamp(tilt * 0.22, -0.35, 0.35);
      }
      const dist = camera.position.distanceTo(scratch.position);
      const lift = Math.max(1.15, Math.min(2.8, dist / (model.sideM * 0.42)));
      const pulse = 0.62 + 0.38 * Math.sin((t + particle.phase) * Math.PI * 2);
      const along = pulse * (0.9 + 0.25 * Math.min(1, Math.max(0, flow.speed)));
      scratch.scale.set(along * lift, lift, 1);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = active ? 0.94 : 0.72;
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
