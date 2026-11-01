import type * as THREE from "three";
import type { RootState } from "@react-three/fiber";

export type QaPerfFrameStats = {
  frames: number;
  fpsAvg: number;
  frameMsAvg: number;
  frameMsP50: number;
  frameMsP95: number;
  frameMsP99: number;
};

export type QaPerfRendererSnapshot = {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  textures: number;
  geometries: number;
  programs: number | null;
  devicePixelRatio: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasClientWidth: number;
  canvasClientHeight: number;
  canvasPixelRatio: number;
};

export type QaPerfOverrides = {
  dprCap?: number;
  disableShadows?: boolean;
  disablePost?: boolean;
  shadowMapSize?: number;
  treesOff?: boolean;
  terrainOff?: boolean;
};

export type QaPerfBridge = {
  sampleFrames: (opts: { durationMs: number; orbit?: boolean }) => Promise<QaPerfFrameStats>;
  getRendererSnapshot: () => QaPerfRendererSnapshot | null;
  setOverrides: (overrides: QaPerfOverrides | null) => void;
};

declare global {
  interface Window {
    __citycutPerf?: QaPerfBridge;
    __citycutPerfOverrides?: QaPerfOverrides | null;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function summarize(samples: number[]): QaPerfFrameStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    frames: sorted.length,
    fpsAvg: sorted.length ? Math.round((1000 * sorted.length) / sum) : 0,
    frameMsAvg: sorted.length ? sum / sorted.length : 0,
    frameMsP50: percentile(sorted, 50),
    frameMsP95: percentile(sorted, 95),
    frameMsP99: percentile(sorted, 99),
  };
}

export function registerQaPerfBridge(bridge: QaPerfBridge | null): void {
  if (typeof window === "undefined") return;
  if (bridge) window.__citycutPerf = bridge;
  else delete window.__citycutPerf;
}

export function applyQaPerfOverrides(state: RootState): void {
  const overrides = typeof window !== "undefined" ? window.__citycutPerfOverrides : null;
  if (!overrides) return;
  if (overrides.dprCap != null) state.setDpr(overrides.dprCap);
  if (overrides.disableShadows) {
    state.gl.shadowMap.enabled = false;
    state.scene.traverse((object) => {
      const light = object as THREE.DirectionalLight;
      if (light.isDirectionalLight) light.castShadow = false;
    });
  }
  if (overrides.disablePost) {
    state.scene.traverse((object) => {
      const composer = object as THREE.Object3D & { enabled?: boolean };
      if (composer.type === "EffectComposer") composer.visible = false;
    });
  }
  if (overrides.shadowMapSize != null) {
    state.scene.traverse((object) => {
      const light = object as THREE.DirectionalLight;
      if (light.isDirectionalLight && light.shadow) {
        light.shadow.mapSize.set(overrides.shadowMapSize!, overrides.shadowMapSize!);
        light.shadow.needsUpdate = true;
      }
    });
  }
  if (overrides.treesOff) {
    state.scene.traverse((object) => {
      if (object.name === "Trees") object.visible = false;
    });
  }
  if (overrides.terrainOff) {
    state.scene.traverse((object) => {
      if (object.name === "Terrain" || object.name === "Contours") object.visible = false;
    });
  }
}

export function rendererSnapshotFromState(state: RootState): QaPerfRendererSnapshot {
  const canvas = state.gl.domElement;
  const rect = canvas.getBoundingClientRect();
  const info = state.gl.info;
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    programs: info.programs?.length ?? null,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    canvasClientWidth: rect.width,
    canvasClientHeight: rect.height,
    canvasPixelRatio: canvas.width / Math.max(1, rect.width),
  };
}

export async function sampleFramesFromState(
  state: RootState,
  opts: { durationMs: number; orbit?: boolean },
): Promise<QaPerfFrameStats> {
  const samples: number[] = [];
  let orbitAngle = 0;
  const basePose = typeof window !== "undefined" ? window.__citycutQa?.getCamera?.() : null;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const elapsed = now - start;
      if (opts.orbit && basePose && window.__citycutQa?.setCamera) {
        orbitAngle += 0.012;
        const eye = basePose.eye;
        const target = basePose.target;
        const dx = eye.x - target.x;
        const dz = eye.z - target.z;
        const dist = Math.hypot(dx, dz) || 500;
        const ang = Math.atan2(dz, dx) + orbitAngle;
        window.__citycutQa.setCamera({
          eye: {
            x: target.x + Math.cos(ang) * dist * 1.15,
            y: eye.y,
            z: target.z + Math.sin(ang) * dist * 1.15,
          },
          target,
        });
      }
      applyQaPerfOverrides(state);
      state.invalidate();
      if (samples.length > 0) samples.push(now - (samples as number[] & { last?: number }).last!);
      (samples as number[] & { last?: number }).last = now;
      if (elapsed >= opts.durationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  samples.shift();
  state.gl.info.reset();
  state.invalidate();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  return summarize(samples);
}
