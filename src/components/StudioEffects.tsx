import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
import {
  PLINTH_SHADOW_SPREAD,
  plinthShadowExtents,
  type SiteFrame,
} from "../lib/siteFrame";
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

const SHADOW_TEXTURE_PX = 512;

function bakePlinthShadow(colour: string, frame: SiteFrame): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_TEXTURE_PX;
  canvas.height = SHADOW_TEXTURE_PX;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const size = SHADOW_TEXTURE_PX / PLINTH_SHADOW_SPREAD;
  const centre = SHADOW_TEXTURE_PX / 2;
  const away = SHADOW_TEXTURE_PX * 4;
  const aspect = frame.widthM / Math.max(frame.heightM, 1e-6);
  const drawW = aspect >= 1 ? size : size * aspect;
  const drawH = aspect >= 1 ? size / aspect : size;
  const footprint = (inset: number) => {
    context.beginPath();
    if (frame.shape === "circle") context.arc(centre - away, centre, Math.min(drawW, drawH) / 2 - inset, 0, Math.PI * 2);
    else {
      const w = drawW - inset * 2;
      const h = drawH - inset * 2;
      context.rect(centre - away - drawW / 2 + inset, centre - drawH / 2 + inset, w, h);
    }
    context.fill();
  };
  context.fillStyle = colour;
  context.shadowColor = colour;
  context.shadowOffsetX = away;
  context.globalAlpha = 0.55;
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
  frame,
  plinthBottomY,
  colourTick,
}: {
  frame: SiteFrame;
  plinthBottomY: number;
  colourTick: number;
}) {
  const texture = useMemo(() => bakePlinthShadow(getColour("--plinth-shadow"), frame), [frame, colourTick]);
  useEffect(() => () => texture?.dispose(), [texture]);
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
