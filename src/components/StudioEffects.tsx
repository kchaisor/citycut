import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
import { getPlinthShadowTexture, plinthShadowTextureCacheKey } from "../lib/plinthContactShadow";
import { plinthShadowExtents, type SiteFrame } from "../lib/siteFrame";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import {
  ambientOcclusionActive,
  studioAoActive,
  studioN8AoParams,
  studioSmaaActive,
  type RenderQuality,
} from "../lib/renderQuality";

function studioPostEnabled(): boolean {
  if (typeof window === "undefined") return true;
  if (qaModeFromSearch(window.location.search) && window.__citycutPerfOverrides?.disablePost) return false;
  return true;
}

export const INTRO_ACTIVE_KEY = "citycutIntroActive";

const REST_FRAMES = 8;

type AoPass = {
  enabled: boolean;
  configuration: { gammaCorrection: boolean; transparencyAware?: boolean };
};

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

export function useCameraMoving(): { readonly current: boolean } {
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

function StudioComposer({
  quality,
  noToneMapping,
  sideM,
  primaryView,
}: {
  quality: RenderQuality;
  noToneMapping: boolean;
  sideM: number;
  primaryView: boolean;
}) {
  const aoRef = useRef<AoPass | null>(null);
  const moving = useCameraMoving();
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const setAoPass = useCallback((pass: AoPass | null) => {
    aoRef.current = pass;
    if (pass) {
      pass.configuration.gammaCorrection = false;
      pass.configuration.transparencyAware = true;
      pass.enabled = false;
    }
  }, []);
  useFrame(() => {
    const pass = aoRef.current;
    if (!pass) return;
    const on = ambientOcclusionActive(qualityRef.current, moving.current);
    if (pass.enabled !== on) pass.enabled = on;
  });
  const ao = studioN8AoParams(sideM, primaryView);
  return (
    <EffectComposer multisampling={0} renderPriority={1}>
      {studioAoActive(quality) ? (
        <N8AO
          ref={setAoPass}
          enabled={quality === "high"}
          quality="performance"
          halfRes
          aoSamples={ao.aoSamples}
          denoiseSamples={ao.denoiseSamples}
          denoiseRadius={ao.denoiseRadius}
          depthAwareUpsampling
          aoRadius={ao.aoRadius}
          distanceFalloff={ao.distanceFalloff}
          intensity={ao.intensity}
        />
      ) : null}
      <ToneMapping mode={noToneMapping ? ToneMappingMode.LINEAR : ToneMappingMode.ACES_FILMIC} />
      {studioSmaaActive(quality) ? <SMAA /> : null}
    </EffectComposer>
  );
}

function PlinthContactShadow({
  frame,
  plinthBottomY,
  colourTick,
}: {
  frame: SiteFrame;
  plinthBottomY: number;
  colourTick: number;
}) {
  const shadowColour = getColour("--plinth-shadow");
  const cacheKey = plinthShadowTextureCacheKey(frame, shadowColour);
  const texture = useMemo(
    () => getPlinthShadowTexture(frame, shadowColour),
    [cacheKey, colourTick],
  );
  const setMesh = useCallback((mesh: THREE.Mesh | null) => {
    if (!mesh) return;
    markScreenOnly(mesh);
    mesh.raycast = () => {};
  }, []);
  if (!texture) return null;
  const { widthM, heightM } = plinthShadowExtents(frame);
  return (
    <mesh ref={setMesh} position={[0, plinthBottomY - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function StudioEffects({
  quality,
  noToneMapping,
  sideM,
  plinthBottomY,
  showShadow,
  frame,
  colourTick,
  primaryView,
}: {
  quality: RenderQuality;
  noToneMapping: boolean;
  sideM: number;
  plinthBottomY: number;
  showShadow: boolean;
  frame: SiteFrame;
  colourTick: number;
  primaryView: boolean;
}) {
  const settled = useIntroSettled();
  if (!settled) return null;
  return (
    <>
      {showShadow ? <PlinthContactShadow frame={frame} plinthBottomY={plinthBottomY} colourTick={colourTick} /> : null}
      {studioPostEnabled() ? (
        <StudioComposer quality={quality} noToneMapping={noToneMapping} sideM={sideM} primaryView={primaryView} />
      ) : null}
    </>
  );
}
