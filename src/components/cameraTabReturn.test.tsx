// @vitest-environment happy-dom
import { act, advance, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import type { CameraMemoryRef } from "../lib/cameraMemory";
import type { Aabb } from "../lib/isoCamera";
import type { ProjectionMode } from "../lib/viewMemory";
import type { SolarViewSettings } from "./SolarHeliodon";
import { Cameras } from "./Scene3D";

extend(THREE as unknown as Parameters<typeof extend>[0]);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const W = 1200;
const H = 800;
const SIDE = 1000;
const SOLAR: SolarViewSettings = {
  showPath: false,
  castShadows: false,
  radiusFactor: 1,
  year: 2026,
  month: 6,
  day: 21,
  hour: 12,
  minute: 0,
};

type Controls = { target: THREE.Vector3; update: () => void; enableDamping: boolean };
type RigState = { camera: THREE.PerspectiveCamera | THREE.OrthographicCamera; controls: Controls | null };
type Rig = {
  unmount: () => Promise<void>;
  state: () => RigState;
  resize: (w: number, h: number) => Promise<void>;
  rerender: (opts: MountOpts) => Promise<void>;
};

const live: Rig[] = [];
afterEach(async () => {
  while (live.length) await live.pop()!.unmount();
});

function stubRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const noop = () => {};
  return {
    domElement: canvas,
    render: noop,
    setPixelRatio: noop,
    getPixelRatio: () => 1,
    setSize: noop,
    setAnimationLoop: noop,
    dispose: noop,
    forceContextLoss: noop,
    shadowMap: { enabled: false, type: THREE.PCFShadowMap, needsUpdate: false },
    xr: { enabled: false, isPresenting: false, addEventListener: noop, removeEventListener: noop, setAnimationLoop: noop },
    info: { render: {}, memory: {} },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
  } as unknown as THREE.WebGLRenderer;
}

let clock = 0;
async function frames(n = 4) {
  for (let i = 0; i < n; i++) {
    clock += 16;
    await act(async () => advance(clock, true));
  }
}

type MountOpts = { snapId?: number; projection?: ProjectionMode; freeRotate?: boolean };

async function mount3d(memory: CameraMemoryRef | undefined, opts: MountOpts = {}) {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const root = createRoot(canvas);
  let store: { getState: () => RigState } | null = null;
  const element = (o: MountOpts) => (
    <Cameras
      side={SIDE}
      lift={0}
      groundY={0}
      siteTopY={60}
      projection={o.projection ?? "perspective"}
      corner="sw"
      freeRotate={o.freeRotate ?? false}
      snapId={o.snapId ?? 0}
      boundsRef={bounds}
      onExportReady={() => {}}
      solarDiagramOn={false}
      heliodonRadius={SIDE * 0.6}
      solar={SOLAR}
      lat={-37.8127}
      lon={144.98061}
      cameraMemory={memory}
    />
  );
  const bounds: { current: Aabb | null } = { current: { min: [-SIDE / 2, 0, -SIDE / 2], max: [SIDE / 2, 60, SIDE / 2] } };
  await act(async () => {
    await root.configure({
      gl: stubRenderer(canvas),
      size: { width: W, height: H, top: 0, left: 0 },
      frameloop: "never",
      dpr: 1,
    });
    store = root.render(element(opts)) as unknown as { getState: () => RigState };
  });
  await frames();
  const rig: Rig = {
    state: () => store!.getState(),
    rerender: async (o) => {
      await act(async () => {
        root.render(element(o));
      });
      await frames(6);
    },
    resize: async (width, height) => {
      await act(async () => {
        await root.configure({ size: { width, height, top: 0, left: 0 } });
      });
      await frames(6);
    },
    unmount: async () => {
      await act(async () => root.unmount());
      canvas.remove();
      const i = live.indexOf(rig);
      if (i >= 0) live.splice(i, 1);
    },
  };
  live.push(rig);
  return rig;
}

function read(rig: Rig) {
  const { camera, controls } = rig.state();
  camera.updateMatrixWorld();
  return {
    kind: (camera as THREE.OrthographicCamera).isOrthographicCamera ? "ortho" : "persp",
    position: camera.position.toArray(),
    quaternion: camera.quaternion.toArray(),
    up: camera.up.toArray(),
    target: controls!.target.toArray(),
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
    projection: Array.from(camera.projectionMatrix.elements),
  };
}

async function userOrbit(rig: Rig) {
  const { camera, controls } = rig.state();
  const offset = camera.position.clone().sub(controls!.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.1).multiplyScalar(0.55);
  controls!.target.add(new THREE.Vector3(130, 0, -70));
  camera.position.copy(controls!.target).add(offset);
  controls!.update();
  (controls as unknown as THREE.EventDispatcher<{ start: object }>).dispatchEvent({ type: "start" });
  await frames(6);
}

describe("3D camera across a 3D → Drawing → 3D round trip", () => {
  it("comes back exactly where the user left it (position, target, up, zoom, projection)", async () => {
    const memory: CameraMemoryRef = { current: null };
    const first = await mount3d(memory);
    const fitted = read(first);
    await userOrbit(first);
    const before = read(first);
    expect(before.position).not.toEqual(fitted.position);
    expect(before.target).not.toEqual(fitted.target);

    await first.unmount();
    const second = await mount3d(memory);
    await frames(10);
    expect(read(second)).toEqual(before);
  });

  it("main's behaviour without the memory snaps back to the fitted view (guards the test itself)", async () => {
    const first = await mount3d(undefined);
    const fitted = read(first);
    await userOrbit(first);
    await first.unmount();
    const second = await mount3d(undefined);
    expect(read(second).position).toEqual(fitted.position);
  });

  it("keeps an orthographic (plan) camera too", async () => {
    const memory: CameraMemoryRef = { current: null };
    const first = await mount3d(memory, { projection: "plan" });
    const { camera, controls } = first.state();
    controls!.target.x += 75;
    camera.position.x += 75;
    camera.zoom *= 1.7;
    camera.updateProjectionMatrix();
    (controls as unknown as THREE.EventDispatcher<{ start: object }>).dispatchEvent({ type: "start" });
    await frames(6);
    const before = read(first);
    await first.unmount();
    const second = await mount3d(memory, { projection: "plan" });
    await frames(10);
    expect(read(second)).toEqual(before);
  });

  it("a new model (fresh memory) or a new snap id frames afresh", async () => {
    const memory: CameraMemoryRef = { current: null };
    const first = await mount3d(memory);
    const fitted = read(first);
    await userOrbit(first);
    await first.unmount();
    const fresh = await mount3d({ current: null });
    expect(read(fresh)).toEqual(fitted);
    await fresh.unmount();
    const resnapped = await mount3d(memory, { snapId: 1 });
    expect(read(resnapped)).toEqual(fitted);
  });

  it("after the round trip a window resize still keeps the user's pose (#81)", async () => {
    const memory: CameraMemoryRef = { current: null };
    const first = await mount3d(memory);
    await userOrbit(first);
    const before = read(first);
    await first.unmount();
    const second = await mount3d(memory);
    await second.resize(900, 640);
    await second.resize(W, H);
    expect(read(second)).toEqual(before);
  });

  it("iso with Free rotate: after the round trip, unticking Free rotate still keeps the pose (#81)", async () => {
    const memory: CameraMemoryRef = { current: null };
    const iso = { projection: "iso" as const, freeRotate: true };
    const first = await mount3d(memory, iso);
    const { camera, controls } = first.state();
    controls!.target.x += 40;
    camera.position.x += 40;
    camera.zoom *= 1.3;
    camera.updateProjectionMatrix();
    controls!.update();
    (controls as unknown as THREE.EventDispatcher<{ start: object }>).dispatchEvent({ type: "start" });
    await frames(6);
    const before = read(first);
    await first.unmount();
    const second = await mount3d(memory, iso);
    expect(read(second)).toEqual(before);
    await second.rerender({ ...iso, freeRotate: false });
    expect(read(second)).toEqual(before);
  });

  it("switching Perspective → Isometric → Plan → Isometric snaps the shared ortho camera to each projection", async () => {
    const memory: CameraMemoryRef = { current: null };
    const view = await mount3d(memory, { projection: "perspective" });
    await view.rerender({ projection: "iso" });
    const isoPose = read(view);
    expect(isoPose.kind).toBe("ortho");
    expect(isoPose.up).toEqual([0, 1, 0]);
    expect(Math.hypot(isoPose.position[0], isoPose.position[2])).toBeGreaterThan(100);

    await view.rerender({ projection: "plan" });
    const planPose = read(view);
    expect(planPose.kind).toBe("ortho");
    expect(planPose.up).toEqual([0, 0, -1]);

    await view.rerender({ projection: "iso" });
    expect(read(view)).toEqual(isoPose);
  });
});
