import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { patchSceneContinuousFlags, sceneNeedsContinuousRender } from "./sceneRenderLoop";

const INTRO_ACTIVE_KEY = "citycutIntroActive";

describe("sceneRenderLoop", () => {
  it("requests continuous render for intro, motion, and flagged playback", () => {
    const scene = new THREE.Scene();
    expect(sceneNeedsContinuousRender(scene, true, false)).toBe(true);
    expect(sceneNeedsContinuousRender(scene, false, true)).toBe(true);
    patchSceneContinuousFlags(scene, { wind: true });
    expect(sceneNeedsContinuousRender(scene, false, false)).toBe(true);
    patchSceneContinuousFlags(scene, { wind: false, walkRipple: true });
    expect(sceneNeedsContinuousRender(scene, false, false)).toBe(true);
    scene.userData[INTRO_ACTIVE_KEY] = true;
    expect(sceneNeedsContinuousRender(scene, true, false)).toBe(true);
    patchSceneContinuousFlags(scene, { walkRipple: false });
    scene.userData[INTRO_ACTIVE_KEY] = false;
    expect(sceneNeedsContinuousRender(scene, false, false)).toBe(false);
  });
});
