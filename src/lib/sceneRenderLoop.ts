import type * as THREE from "three";

export const SCENE_CONTINUOUS_KEY = "citycutSceneContinuous";

export type SceneContinuousFlags = {
  wind: boolean;
  walkRipple: boolean;
  solarPlay: boolean;
};

export function sceneContinuousFlags(scene: THREE.Scene): SceneContinuousFlags {
  const stored = scene.userData[SCENE_CONTINUOUS_KEY] as Partial<SceneContinuousFlags> | undefined;
  return {
    wind: Boolean(stored?.wind),
    walkRipple: Boolean(stored?.walkRipple),
    solarPlay: Boolean(stored?.solarPlay),
  };
}

export function patchSceneContinuousFlags(scene: THREE.Scene, patch: Partial<SceneContinuousFlags>): void {
  const current = sceneContinuousFlags(scene);
  scene.userData[SCENE_CONTINUOUS_KEY] = { ...current, ...patch };
}

export function sceneNeedsContinuousRender(
  scene: THREE.Scene,
  introActive: boolean,
  cameraMoving: boolean,
): boolean {
  if (introActive || cameraMoving) return true;
  const flags = sceneContinuousFlags(scene);
  return flags.wind || flags.walkRipple || flags.solarPlay;
}
