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
import { bakeGroundWindGlyphTexture, bakeGroundWindHaloTexture } from "../lib/groundWindGlyph";
import type { WindPeriodStats } from "../lib/windRose";

function reducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateParticles(
  particles: GroundWindParticle[],
  model: CityModel,
  blocks: boolean[][],
  base: { east: number; north: number },
  mesh: THREE.InstancedMesh,
  scratch: THREE.Object3D,
  t: number,
  camera: THREE.Camera,
  scaleMul: number,
  opacityMul: number,
) {
  const half = model.sideM / 2;
  const flowAxis = new THREE.Vector3();
  particles.forEach((particle, index) => {
    const travel = ((t + particle.phase) % 1) * model.sideM * particle.lane;
    const flow = groundWindVectorAt(particle.east, particle.north, model, blocks, base);
    const east = particle.east + flow.east * travel * particle.speed;
    const north = particle.north + flow.north * travel * particle.speed;
    const wrappedE = east > half ? east - model.sideM : east < -half ? east + model.sideM : east;
    const wrappedN = north > half ? north - model.sideM : north < -half ? north + model.sideM : north;
    const y = groundWindHeightAt(model, wrappedE, wrappedN);
    flowAxis.set(flow.east, 0, -flow.north).normalize();
    const yaw = Math.atan2(flowAxis.x, flowAxis.z);
    scratch.position.set(wrappedE, y, -wrappedN);
    scratch.rotation.set(-Math.PI / 2, 0, yaw);
    const dist = camera.position.distanceTo(scratch.position);
    const lift = Math.max(1.2, Math.min(3.2, dist / (model.sideM * 0.38)));
    const pulse = 0.5 + 0.5 * Math.sin((t + particle.phase) * Math.PI * 2);
    const along = pulse * (0.88 + 0.32 * Math.min(1, Math.max(0, flow.speed)));
    const s = along * lift * scaleMul;
    scratch.scale.set(s, s * 0.92, 1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.opacity = (mat.userData.baseOpacity as number) * opacityMul;
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
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const phase = useRef(0);
  const { length, width } = useMemo(() => groundWindGlyphScaleM(model.sideM), [model.sideM]);
  const glyphMap = useMemo(() => bakeGroundWindGlyphTexture(), []);
  const haloMap = useMemo(() => bakeGroundWindHaloTexture(), []);
  const coreGeometry = useMemo(() => new THREE.PlaneGeometry(length, width), [length, width]);
  const haloGeometry = useMemo(() => new THREE.PlaneGeometry(length * 1.35, width * 1.45), [length, width]);
  const coreMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: glyphMap,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.userData.baseOpacity = 0.82;
    return material;
  }, [glyphMap]);
  const haloMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: haloMap,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      blending: THREE.NormalBlending,
    });
    material.userData.baseOpacity = 0.55;
    return material;
  }, [haloMap]);
  const reduced = reducedMotionPreferred();
  const active = animate && !reduced;
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);

  useEffect(
    () => () => {
      coreGeometry.dispose();
      haloGeometry.dispose();
      coreMaterial.dispose();
      haloMaterial.dispose();
      glyphMap.dispose();
      haloMap.dispose();
    },
    [coreGeometry, haloGeometry, coreMaterial, haloMaterial, glyphMap, haloMap],
  );

  useFrame((_, delta) => {
    const core = coreRef.current;
    const halo = haloRef.current;
    if (!core || !halo) return;
    if (active) phase.current = (phase.current + delta) % GROUND_WIND_LOOP_SEC;
    const t = phase.current / GROUND_WIND_LOOP_SEC;
    const opacityMul = active ? 1 : 0.72;
    animateParticles(particles, model, blocks, base, halo, scratch, t, camera, 1.18, opacityMul);
    animateParticles(particles, model, blocks, base, core, scratch, t, camera, 1, opacityMul);
    invalidate();
  });

  return (
    <>
      <instancedMesh
        ref={haloRef}
        args={[haloGeometry, haloMaterial, particles.length]}
        frustumCulled={false}
        renderOrder={877}
      />
      <instancedMesh
        ref={coreRef}
        args={[coreGeometry, coreMaterial, particles.length]}
        frustumCulled={false}
        renderOrder={878}
      />
    </>
  );
}
