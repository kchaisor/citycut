// @vitest-environment happy-dom
import { act, advance, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cornersOf, type Aabb } from "../lib/isoCamera";
import { EXPLODE_LAYERS, explodeOffsets, liftedBox } from "../lib/modelExplode";
import type { ProjectionMode } from "../lib/viewMemory";
import type { SolarViewSettings } from "./SolarHeliodon";
import { Cameras, ExplodeLayers, createExplodeRuntime, type ExplodeRuntime } from "./Scene3D";

extend(THREE as unknown as Parameters<typeof extend>[0]);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const W = 1200;
const H = 800;
const SIDE = 500;
const HALF = SIDE / 2;
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

function slab(name: string, bottom: number, top: number, half = HALF): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(half * 2, top - bottom, half * 2);
  geometry.translate(0, (bottom + top) / 2, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}

function sampleCity(): THREE.Group {
  const city = new THREE.Group();
  city.name = "CityCut";
  const trees = new THREE.Group();
  trees.name = "Trees";
  trees.add(slab("TreesBucket", 0, 15, 40));
  city.add(slab("Terrain", -10, 0), slab("Roads", 0, 1), slab("Buildings", 0, 60, 30), trees);
  return city;
}

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
async function frames(n: number) {
  for (let i = 0; i < n; i++) {
    clock += 16;
    await act(async () => advance(clock, true));
  }
}

type Opts = { exploded: boolean; gapM: number; projection?: ProjectionMode };

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.unstubAllGlobals();
});

async function mountExplode(initial: Opts) {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const root = createRoot(canvas);
  const city = sampleCity();
  const runtime: { current: ExplodeRuntime } = { current: createExplodeRuntime() };
  const overlay: { current: THREE.Group | null } = { current: null };
  const bounds: { current: Aabb | null } = { current: { min: [-HALF, -10, -HALF], max: [HALF, 60, HALF] } };
  const collapsed = vi.fn();
  const topLift = vi.fn();
  let store: { getState: () => { camera: THREE.OrthographicCamera } } | null = null;
  const element = (o: Opts) => (
    <>
      <primitive object={city} />
      <group ref={overlay} />
      <ExplodeLayers
        city={city}
        overlayRef={overlay}
        importedMassing={null}
        runtime={runtime}
        cityBoundsRef={bounds}
        exploded={o.exploded}
        gapM={o.gapM}
        measureKey="all"
        onCollapsed={collapsed}
        onTopLift={topLift}
      />
      <Cameras
        side={SIDE}
        frameWidthM={SIDE}
        frameHeightM={SIDE}
        lift={0}
        groundY={0}
        siteTopY={60}
        projection={o.projection ?? "iso"}
        corner="sw"
        freeRotate={false}
        snapId={0}
        boundsRef={bounds}
        onExportReady={() => {}}
        solarDiagramOn={false}
        heliodonRadius={SIDE * 0.6}
        solar={SOLAR}
        lat={-37.8127}
        lon={144.98061}
        explode={runtime}
      />
    </>
  );
  await act(async () => {
    await root.configure({
      gl: stubRenderer(canvas),
      size: { width: W, height: H, top: 0, left: 0 },
      frameloop: "never",
      dpr: 1,
    });
    store = root.render(element(initial)) as unknown as { getState: () => { camera: THREE.OrthographicCamera } };
  });
  await frames(4);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    canvas.remove();
  });
  return {
    canvas,
    city,
    runtime,
    overlay,
    collapsed,
    topLift,
    camera: () => store!.getState().camera,
    rerender: async (o: Opts) => {
      await act(async () => {
        root.render(element(o));
      });
    },
  };
}

function layerY(city: THREE.Group, name: string): number {
  return city.getObjectByName(name)!.position.y;
}

function stackInView(camera: THREE.OrthographicCamera, runtime: ExplodeRuntime): boolean {
  camera.updateMatrixWorld();
  const point = new THREE.Vector3();
  for (const layer of EXPLODE_LAYERS) {
    const box = runtime.boxes[layer];
    if (!box) return false;
    for (const corner of cornersOf(liftedBox(box, runtime.offsets[layer]))) {
      point.set(corner[0], corner[1], corner[2]).project(camera);
      if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1) return false;
    }
  }
  return true;
}

describe("exploded axo in the 3D scene", () => {
  it("leaves the assembled scene untouched until it is exploded", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    await frames(6);
    for (const child of rig.city.children) expect(child.position.y).toBe(0);
    expect(rig.runtime.current.progress).toBe(0);
    expect(rig.canvas.dataset.exploded).toBe("0");
    expect(rig.canvas.dataset.explodeProgress).toBe("0.000");
  });

  it("animates the four layers apart, keeps the whole stack in view each frame, and reports the end state", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    const assembledZoom = rig.camera().zoom;
    await rig.rerender({ exploded: true, gapM: 75 });
    let midFrames = 0;
    for (let i = 0; i < 30; i++) {
      await frames(1);
      const { progress } = rig.runtime.current;
      if (progress > 0 && progress < 1) {
        midFrames += 1;
        expect(rig.canvas.dataset.exploded).toBe("0");
      }
      expect(stackInView(rig.camera(), rig.runtime.current)).toBe(true);
    }
    expect(midFrames).toBeGreaterThan(8);
    expect(rig.runtime.current.progress).toBe(1);
    expect(rig.canvas.dataset.exploded).toBe("1");
    expect(rig.canvas.dataset.explodeProgress).toBe("1.000");
    const offsets = explodeOffsets(rig.runtime.current.boxes, 75, 1);
    expect(offsets).toEqual({ ground: 0, transport: 75, buildings: 151, trees: 286 });
    expect(layerY(rig.city, "Terrain")).toBe(0);
    expect(layerY(rig.city, "Roads")).toBe(75);
    expect(layerY(rig.city, "Buildings")).toBe(151);
    expect(layerY(rig.city, "Trees")).toBe(286);
    expect(rig.overlay.current!.position.y).toBe(151);
    expect(rig.camera().zoom).toBeLessThan(assembledZoom);
    expect(rig.topLift).toHaveBeenLastCalledWith(286 + 15 - 60);
  });

  it("still picks a building where it now sits", async () => {
    const rig = await mountExplode({ exploded: true, gapM: 75 });
    await frames(30);
    rig.city.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 5000, 0), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(rig.city, true).find((item) => item.object.name === "Buildings");
    expect(hit?.point.y).toBeCloseTo(60 + 151, 6);
  });

  it("restacks and re-fits live when the gap changes", async () => {
    const rig = await mountExplode({ exploded: true, gapM: 75 });
    await frames(30);
    const zoom = rig.camera().zoom;
    await rig.rerender({ exploded: true, gapM: 200 });
    await frames(2);
    expect(layerY(rig.city, "Roads")).toBe(200);
    expect(layerY(rig.city, "Trees")).toBe(200 + 201 + 260);
    expect(rig.camera().zoom).toBeLessThan(zoom);
    expect(stackInView(rig.camera(), rig.runtime.current)).toBe(true);
  });

  it("animates back together, fits the assembled model again, and reports the collapse once done", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    const assembled = { zoom: rig.camera().zoom, position: rig.camera().position.toArray() };
    await rig.rerender({ exploded: true, gapM: 75 });
    await frames(30);
    rig.collapsed.mockClear();
    await rig.rerender({ exploded: false, gapM: 75, projection: "iso" });
    await frames(4);
    expect(rig.runtime.current.progress).toBeGreaterThan(0);
    expect(rig.runtime.current.progress).toBeLessThan(1);
    expect(rig.collapsed).not.toHaveBeenCalled();
    expect(stackInView(rig.camera(), rig.runtime.current)).toBe(true);
    await frames(30);
    for (const child of rig.city.children) expect(child.position.y).toBe(0);
    expect(rig.overlay.current!.position.y).toBe(0);
    expect(rig.collapsed).toHaveBeenCalled();
    expect(rig.topLift).toHaveBeenLastCalledWith(0);
    expect(rig.canvas.dataset.exploded).toBe("0");
    expect(rig.camera().zoom).toBeCloseTo(assembled.zoom, 6);
    expect(rig.camera().position.toArray()).toEqual(assembled.position);
  });

  it("measures a layer added while exploded without counting the lift twice", async () => {
    const rig = await mountExplode({ exploded: true, gapM: 75 });
    await frames(30);
    const overlay = slab("HeightEditOverlay", 0, 60, 10);
    rig.city.add(overlay);
    await frames(1);
    expect(overlay.position.y).toBe(151);
    expect(rig.runtime.current.boxes.buildings).toEqual({ min: [-30, 0, -30], max: [30, 60, 30] });
  });

  it("jumps straight to the end state with reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query }));
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    await rig.rerender({ exploded: true, gapM: 75 });
    await frames(1);
    expect(rig.runtime.current.progress).toBe(1);
    expect(layerY(rig.city, "Trees")).toBe(286);
    await rig.rerender({ exploded: false, gapM: 75 });
    await frames(1);
    expect(rig.runtime.current.progress).toBe(0);
    expect(layerY(rig.city, "Trees")).toBe(0);
  });
});
