import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
import type { SiteFrameShape } from "../lib/siteFrame";
import { ambientOcclusionActive, type RenderQuality } from "../lib/renderQuality";

export const INTRO_ACTIVE_KEY = "citycutIntroActive";

const REST_FRAMES = 8;

type AoPass = { enabled: boolean; configuration: { gammaCorrection: boolean } };

export function useIntroSettled(): boolean {
  const scene = useThree((state) => state.scene);
  const [settled, setSettled] = useState(() => scene.userData[INTRO_ACTIVE_KEY] !== true);
  const settledRef = useRef(settled);
  useFrame(() => {
    const next = scene.userData[INTRO_ACTIVE_KEY] !== true;
    if (next === settledRef.current) return;
    settledRef.current = next;
    setSettled(next);
  });
  return settled;
}

function useCameraMoving(): { readonly current: boolean } {
  const camera = useThree((state) => state.camera);
  const moving = useRef(false);
  const still = useRef(0);
  const lastWorld = useMemo(() => new THREE.Matrix4(), []);
  const lastProjection = useMemo(() => new THREE.Matrix4(), []);
  useEffect(() => {
    still.current = 0;
    moving.current = true;
  }, [camera]);
  useFrame(({ camera: live }) => {
    const changed = !live.matrixWorld.equals(lastWorld) || !live.projectionMatrix.equals(lastProjection);
    if (changed) {
      lastWorld.copy(live.matrixWorld);
      lastProjection.copy(live.projectionMatrix);
      still.current = 0;
      moving.current = true;
      return;
    }
    if (still.current < REST_FRAMES) still.current += 1;
    moving.current = still.current < REST_FRAMES;
  });
  return moving;
}

function StudioComposer({ quality, noToneMapping, sideM }: { quality: RenderQuality; noToneMapping: boolean; sideM: number }) {
  const aoRef = useRef<AoPass | null>(null);
  const moving = useCameraMoving();
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const setAoPass = useCallback((pass: AoPass | null) => {
    aoRef.current = pass;
    if (pass) {
      pass.configuration.gammaCorrection = false;
      pass.enabled = false;
    }
  }, []);
  useFrame(() => {
    const pass = aoRef.current;
    if (!pass) return;
    const on = ambientOcclusionActive(qualityRef.current, moving.current);
    if (pass.enabled !== on) pass.enabled = on;
  });
  return (
    <EffectComposer multisampling={0} renderPriority={1}>
      <N8AO
        ref={setAoPass}
        enabled={quality === "high"}
        quality="medium"
        halfRes
        aoRadius={Math.max(4, sideM * 0.018)}
        distanceFalloff={1}
        intensity={6}
      />
      <ToneMapping mode={noToneMapping ? ToneMappingMode.LINEAR : ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

const SHADOW_TEXTURE_PX = 512;
const SHADOW_SPREAD = 1.5;

function bakePlinthShadow(colour: string, shape: SiteFrameShape): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_TEXTURE_PX;
  canvas.height = SHADOW_TEXTURE_PX;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const size = SHADOW_TEXTURE_PX / SHADOW_SPREAD;
  const centre = SHADOW_TEXTURE_PX / 2;
  const away = SHADOW_TEXTURE_PX * 4;
  const footprint = (inset: number) => {
    context.beginPath();
    if (shape === "circle") context.arc(centre - away, centre, size / 2 - inset, 0, Math.PI * 2);
    else context.rect(centre - away - size / 2 + inset, centre - size / 2 + inset, size - inset * 2, size - inset * 2);
    context.fill();
  };
  context.fillStyle = colour;
  context.shadowColor = colour;
  context.shadowOffsetX = away;
  context.globalAlpha = 0.7;
  context.shadowBlur = size * 0.11;
  footprint(-size * 0.015);
  context.globalAlpha = 0.9;
  context.shadowBlur = size * 0.025;
  footprint(0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function PlinthContactShadow({
  sideM,
  plinthBottomY,
  frameShape,
  colourTick,
}: {
  sideM: number;
  plinthBottomY: number;
  frameShape: SiteFrameShape;
  colourTick: number;
}) {
  const texture = useMemo(() => bakePlinthShadow(getColour("--plinth-shadow"), frameShape), [frameShape, colourTick]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const setMesh = useCallback((mesh: THREE.Mesh | null) => {
    if (!mesh) return;
    markScreenOnly(mesh);
    mesh.raycast = () => {};
  }, []);
  if (!texture) return null;
  const extent = sideM * SHADOW_SPREAD;
  return (
    <mesh ref={setMesh} position={[0, plinthBottomY - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[extent, extent]} />
      <meshBasicMaterial map={texture} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function StudioEffects({
  quality,
  noToneMapping,
  sideM,
  plinthBottomY,
  showShadow,
  frameShape,
  colourTick,
}: {
  quality: RenderQuality;
  noToneMapping: boolean;
  sideM: number;
  plinthBottomY: number;
  showShadow: boolean;
  frameShape: SiteFrameShape;
  colourTick: number;
}) {
  const settled = useIntroSettled();
  if (!settled) return null;
  return (
    <>
      {showShadow ? <PlinthContactShadow sideM={sideM} plinthBottomY={plinthBottomY} frameShape={frameShape} colourTick={colourTick} /> : null}
      <StudioComposer quality={quality} noToneMapping={noToneMapping} sideM={sideM} />
    </>
  );
}
