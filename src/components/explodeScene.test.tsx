// @vitest-environment happy-dom
import { act, advance, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cornersOf, type Aabb } from "../lib/isoCamera";
import { EXPLODE_LAYERS, explodeOffsets, liftedBox } from "../lib/modelExplode";
import type { ProjectionMode } from "../lib/viewMemory";
import type { SolarViewSettings } from "./SolarHeliodon";
import { makeSiteFrame, type SiteFrame } from "../lib/siteFrame";
import { GROUND_ROADS_LAYER } from "../lib/groundRoads";
import { SolarHeliodon } from "./SolarHeliodon";
import { Cameras, ExplodeLayers, createExplodeRuntime, useExplodeLive, type ExplodeRuntime } from "./Scene3D";
import { capturePose, type CameraPose, type CameraRestoreRequest } from "../lib/cameraMemory";

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

function sampleCity(wet = false): THREE.Group {
  const city = new THREE.Group();
  city.name = "CityCut";
  const trees = new THREE.Group();
  trees.name = "Trees";
  trees.add(slab("TreesBucket", 0, 15, 40));
  city.add(slab("Terrain", -10, 0), slab("Roads", 0, 1), slab("Buildings", 0, 60, 30), trees);
  if (wet) city.add(slab("Water", 0, 0.5, 60), slab("Green", 0, 0.5, 90));
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
async function frames(n: number, stepSec = 0.05) {
  for (let i = 0; i < n; i++) {
    clock += stepSec;
    await act(async () => advance(clock, true));
  }
}

type Opts = { exploded: boolean; gapM: number; projection?: ProjectionMode; terrain?: { min: number; max: number }; frame?: SiteFrame; wet?: boolean; solar?: SolarViewSettings; wind?: boolean; explodeLive?: boolean; snapKey?: number; engage?: boolean; snapId?: number; restore?: CameraRestoreRequest | null };

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountExplode(initial: Opts) {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  document.body.getBoundingClientRect = () => new DOMRect(0, 0, W, H);
  vi.spyOn(performance, "now").mockImplementation(() => clock * 1000);
  const root = createRoot(canvas);
  const city = sampleCity(initial.wet);
  const runtime: { current: ExplodeRuntime } = { current: createExplodeRuntime() };
  const overlay: { current: THREE.Group | null } = { current: null };
  const bounds: { current: Aabb | null } = { current: { min: [-HALF, -10, -HALF], max: [HALF, 60, HALF] } };
  const collapsed = vi.fn();
  const onRestored = vi.fn();
  const topLift = vi.fn();
  let store: { getState: () => { camera: THREE.OrthographicCamera; controls: unknown } } | null = null;
  const windFlow = new THREE.Group();
  windFlow.name = "WindFlow";
  windFlow.add(slab("WindStreaks", 0, 90, 140));
  const Stage = ({ o }: { o: Opts }) => {
    const live = useExplodeLive(o.exploded, o.restore?.id ?? 0);
    const explodeLive = o.engage ? live.explodeLive : (o.explodeLive ?? o.exploded);
    const projection = o.engage && explodeLive ? "iso" : (o.projection ?? "iso");
    return (
    <>
      <primitive object={city} />
      <group ref={overlay} />
      {o.wind ? <primitive object={windFlow} /> : null}
      <SolarHeliodon
        lat={-37.8127}
        lon={144.98061}
        sideM={SIDE}
        groundY={0}
        settings={o.solar ?? SOLAR}
      />
      <ExplodeLayers
        city={city}
        overlayRef={overlay}
        importedMassing={null}
        runtime={runtime}
        cityBoundsRef={bounds}
        exploded={o.exploded}
        gapM={o.gapM}
        measureKey="all"
        terrain={o.terrain}
        frame={o.frame}
        snapKey={o.engage ? (o.restore?.id ?? 0) : o.snapKey}
        onCollapsed={() => {
          live.onExplodeCollapsed();
          collapsed();
        }}
        onTopLift={topLift}
      />
      <Cameras
        side={SIDE}
        frameWidthM={SIDE}
        frameHeightM={SIDE}
        lift={0}
        groundY={0}
        siteTopY={60}
        projection={projection}
        corner="sw"
        freeRotate={false}
        snapId={o.snapId ?? 0}
        boundsRef={bounds}
        onExportReady={() => {}}
        solarDiagramOn={o.solar?.showPath ?? false}
        heliodonRadius={SIDE * 0.6}
        solar={o.solar ?? SOLAR}
        lat={-37.8127}
        lon={144.98061}
        explode={runtime}
        explodeLive={explodeLive}
        cameraRestore={o.restore}
        onCameraRestored={onRestored}
      />
    </>
    );
  };
  const element = (o: Opts) => <Stage o={o} />;
  await act(async () => {
    await root.configure({
      gl: stubRenderer(canvas),
      size: { width: W, height: H, top: 0, left: 0 },
      frameloop: "never",
      dpr: 1,
    });
    store = root.render(element(initial)) as unknown as { getState: () => { camera: THREE.OrthographicCamera; controls: unknown } };
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
    onRestored,
    topLift,
    camera: () => store!.getState().camera,
    controls: () => (store!.getState().controls as { target: THREE.Vector3 }).target,
    pose: () => {
      const state = store!.getState();
      const camera = state.camera;
      const target = (state.controls as { target: THREE.Vector3 }).target;
      return [...camera.position.toArray(), ...target.toArray(), camera.zoom];
    },
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
    if (!box) continue;
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
    expect(offsets).toEqual({ ground: 0, water: 0, parks: 0, transport: 75, buildings: 151, trees: 286 });
    expect(layerY(rig.city, "Terrain")).toBe(0);
    expect(layerY(rig.city, "Roads")).toBe(75);
    expect(layerY(rig.city, "Buildings")).toBe(151);
    expect(layerY(rig.city, "Trees")).toBe(286);
    expect(rig.overlay.current!.position.y).toBe(151);
    expect(rig.camera().zoom).toBeLessThan(assembledZoom);
    expect(rig.topLift).toHaveBeenLastCalledWith(286 + 15 - 60);
  });

  it("lands on time at a low frame rate", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    await rig.rerender({ exploded: true, gapM: 75 });
    await frames(1);
    await frames(2, 0.4);
    expect(rig.runtime.current.progress).toBeGreaterThan(0.5);
    expect(rig.runtime.current.progress).toBeLessThan(1);
    await frames(1, 0.4);
    expect(rig.runtime.current.progress).toBe(1);
    expect(layerY(rig.city, "Trees")).toBe(286);
  });

  it("fills the road openings in ground colour on the Ground layer only while exploded", async () => {
    const terrain = { min: 0, max: 10 };
    const rig = await mountExplode({ exploded: false, gapM: 75, terrain });
    const roads = rig.city.getObjectByName("Roads")!;
    roads.userData.exportLayer = GROUND_ROADS_LAYER;
    expect(rig.city.getObjectByName("ExplodeGroundFill")).toBeUndefined();
    await rig.rerender({ exploded: true, gapM: 75, terrain });
    await frames(30);
    const fill = rig.city.getObjectByName("ExplodeGroundFill")!;
    expect(fill.children).toHaveLength(1);
    expect(fill.position.y).toBe(0);
    expect(layerY(rig.city, "Roads")).toBe(75);
    const mesh = fill.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute("position")).toBe((roads as THREE.Mesh).geometry.getAttribute("position"));
    expect(mesh.geometry.getAttribute("color").count).toBe(mesh.geometry.getAttribute("position").count);
    expect(mesh.userData.noScenePick).toBe(true);
    roads.visible = false;
    await rig.rerender({ exploded: true, gapM: 80, terrain });
    await frames(2);
    expect(mesh.visible).toBe(false);
    await rig.rerender({ exploded: false, gapM: 80, terrain });
    await frames(30);
    expect(rig.city.getObjectByName("ExplodeGroundFill")).toBeUndefined();
    for (const child of rig.city.children) expect(child.position.y).toBe(0);
  });

  it("lifts Water and Parks as their own layers between Ground and Roads", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75, wet: true });
    await rig.rerender({ exploded: true, gapM: 75, wet: true });
    await frames(30);
    const boxes = rig.runtime.current.boxes;
    expect(EXPLODE_LAYERS.filter((layer) => boxes[layer])).toEqual(["ground", "water", "parks", "transport", "buildings", "trees"]);
    const offsets = explodeOffsets(boxes, 75, 1);
    expect(offsets.ground).toBe(0);
    expect(offsets.water).toBeGreaterThan(0);
    expect(offsets.parks).toBeGreaterThan(offsets.water);
    expect(offsets.transport).toBeGreaterThan(offsets.parks);
    expect(layerY(rig.city, "Water")).toBe(offsets.water);
    expect(layerY(rig.city, "Green")).toBe(offsets.parks);
    expect(layerY(rig.city, "Terrain")).toBe(0);
  });

  it("draws one thin boundary outline per present layer, only while exploded", async () => {
    const frame = makeSiteFrame(SIDE, "circle");
    const rig = await mountExplode({ exploded: false, gapM: 75, wet: true, frame });
    const outlines = () => rig.city.getObjectByName("ExplodeOutlines");
    expect(outlines()).toBeUndefined();
    await rig.rerender({ exploded: true, gapM: 75, wet: true, frame });
    await frames(3);
    const mid = rig.runtime.current.progress;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    await frames(30);
    const group = outlines()!;
    expect(group.userData.skipRhinoExport).toBe(true);
    const loops = group.children.filter((child) => child.userData.explodeLayer) as THREE.LineLoop[];
    expect(loops.map((child) => child.userData.explodeLayer)).toEqual([...EXPLODE_LAYERS]);
    const { boxes, offsets } = rig.runtime.current;
    for (const line of loops) {
      const layer = line.userData.explodeLayer as (typeof EXPLODE_LAYERS)[number];
      expect(line.position.y).toBe(boxes[layer]!.min[1] + offsets[layer]);
      expect(line).toBeInstanceOf(THREE.LineLoop);
      expect(line.geometry.getAttribute("position").count).toBeGreaterThan(64);
      const hits: THREE.Intersection[] = [];
      line.raycast(new THREE.Raycaster(), hits);
      expect(hits).toHaveLength(0);
    }
    expect(rig.runtime.current.bounds!.max[1]).toBe(boxes.trees!.max[1] + offsets.trees);
    const treesY = loops.find((child) => child.userData.explodeLayer === "trees")!.position.y;
    await rig.rerender({ exploded: true, gapM: 150, wet: true, frame });
    await frames(2);
    const gapped = rig.runtime.current;
    for (const line of outlines()!.children.filter((child) => child.userData.explodeLayer) as THREE.LineLoop[]) {
      const layer = line.userData.explodeLayer as (typeof EXPLODE_LAYERS)[number];
      expect(line.position.y).toBe(gapped.boxes[layer]!.min[1] + gapped.offsets[layer]);
    }
    const treesOutline = (g: THREE.Object3D) => g.children.find((child) => child.userData.explodeLayer === "trees")!.position.y;
    expect(treesOutline(outlines()!)).toBeGreaterThan(treesY);
    await rig.rerender({ exploded: false, gapM: 150, wet: true, frame });
    await frames(30);
    expect(outlines()).toBeUndefined();
    for (const child of rig.city.children) expect(child.position.y).toBe(0);
  });

  it("draws one dashed vertical line per corner from the bottom to the top layer base", async () => {
    const frame = makeSiteFrame(SIDE, "square");
    const rig = await mountExplode({ exploded: false, gapM: 75, frame });
    const corners = () => rig.city.getObjectByName("ExplodeCorners");
    expect(corners()).toBeUndefined();
    await rig.rerender({ exploded: true, gapM: 75, frame });
    await frames(3);
    expect(rig.runtime.current.progress).toBeGreaterThan(0);
    expect(rig.runtime.current.progress).toBeLessThan(1);
    const midHeight = (corners()!.children[0] as THREE.Line).geometry.getAttribute("position").getY(1);
    await frames(30);
    const spans = (gapM: number) => {
      const { boxes, offsets } = rig.runtime.current;
      const group = corners()!;
      expect(group.userData.skipRhinoExport).toBe(true);
      expect(group.children).toHaveLength(4);
      const bottom = boxes.ground!.min[1] + offsets.ground;
      const top = boxes.trees!.min[1] + offsets.trees;
      for (const child of group.children) {
        const line = child as THREE.Line;
        expect(line.material).toBeInstanceOf(THREE.LineDashedMaterial);
        expect(line.geometry.getAttribute("lineDistance")).toBeDefined();
        expect(line.position.y).toBe(bottom);
        expect(line.geometry.getAttribute("position").getY(1)).toBeCloseTo(top - bottom, 9);
        const hits: THREE.Intersection[] = [];
        line.raycast(new THREE.Raycaster(), hits);
        expect(hits).toHaveLength(0);
      }
      expect(gapM).toBeGreaterThan(0);
      return top - bottom;
    };
    const short = spans(75);
    expect(short).toBeGreaterThan(midHeight);
    await rig.rerender({ exploded: true, gapM: 200, frame });
    await frames(2);
    expect(spans(200)).toBeGreaterThan(short);
    await rig.rerender({ exploded: false, gapM: 200, frame });
    await frames(30);
    expect(corners()).toBeUndefined();
  });

  it("draws no corner lines on a round cut", async () => {
    const frame = makeSiteFrame(SIDE, "circle");
    const rig = await mountExplode({ exploded: true, gapM: 75, frame });
    await frames(30);
    expect(rig.city.getObjectByName("ExplodeOutlines")).toBeDefined();
    expect(rig.city.getObjectByName("ExplodeCorners")).toBeUndefined();
  });

  it("outlines only the layers that are present", async () => {
    const frame = makeSiteFrame(SIDE, "square");
    const rig = await mountExplode({ exploded: true, gapM: 75, frame });
    await frames(30);
    const layers = rig.city.getObjectByName("ExplodeOutlines")!.children.map((child) => child.userData.explodeLayer).filter(Boolean);
    expect(layers).toEqual(["ground", "transport", "buildings", "trees"]);
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

  it("lands directly in the finished exploded state on a restore snap, with no animation", async () => {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    await rig.rerender({ exploded: true, gapM: 75, snapKey: 1 });
    await frames(1, 0.001);
    expect(rig.runtime.current.progress).toBe(1);
    expect(rig.canvas.dataset.exploded).toBe("1");
    expect(rig.canvas.dataset.explodeProgress).toBe("1.000");
    expect(layerY(rig.city, "Trees")).toBe(286);
  });

  it("collapses at once on a restore snap", async () => {
    const rig = await mountExplode({ exploded: true, gapM: 75 });
    await frames(30);
    await rig.rerender({ exploded: false, gapM: 75, snapKey: 1 });
    await frames(1, 0.001);
    expect(rig.runtime.current.progress).toBe(0);
    expect(layerY(rig.city, "Trees")).toBe(0);
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

  describe("analysis toggles never move the camera", () => {
    const SUN_ON: SolarViewSettings = { ...SOLAR, showPath: true };
    const SHADOWS_ON: SolarViewSettings = { ...SUN_ON, castShadows: true, hour: 15 };

    function expectSame(now: number[], before: number[]) {
      expect(now).toHaveLength(before.length);
      for (const [i, v] of now.entries()) expect(Math.abs(v - before[i])).toBeLessThan(1e-6);
    }

    async function expectStill(opts: Opts) {
      const rig = await mountExplode(opts);
      await frames(40);
      const before = rig.pose();
      await rig.rerender({ ...opts, solar: SUN_ON });
      await frames(20);
      expectSame(rig.pose(), before);
      await rig.rerender({ ...opts, solar: SHADOWS_ON, wind: true });
      await frames(20);
      expectSame(rig.pose(), before);
      await rig.rerender({ ...opts, solar: SOLAR });
      await frames(20);
      expectSame(rig.pose(), before);
      return rig;
    }

    it("keeps the Isometric camera still when Solar Study, shadows and wind come on", async () => {
      await expectStill({ exploded: false, gapM: 75 });
    });

    it("keeps the Perspective camera still when Solar Study, shadows and wind come on", async () => {
      await expectStill({ exploded: false, gapM: 75, projection: "perspective" });
    });

    it("keeps the Plan camera still when Solar Study, shadows and wind come on", async () => {
      await expectStill({ exploded: false, gapM: 75, projection: "plan" });
    });

    it("keeps the exploded stack where it was fitted when Solar Study, shadows and wind come on", async () => {
      const rig = await expectStill({ exploded: true, gapM: 75 });
      expect(stackInView(rig.camera(), rig.runtime.current)).toBe(true);
    });
  });
});

describe("leaving the exploded axo", () => {
  async function collapseTo(projection: ProjectionMode) {
    const rig = await mountExplode({ exploded: false, gapM: 75 });
    await rig.rerender({ exploded: true, gapM: 75 });
    await frames(30);
    rig.collapsed.mockClear();
    await rig.rerender({ exploded: false, gapM: 75, projection: "iso", explodeLive: true });
    while (!rig.collapsed.mock.calls.length) await frames(1);
    await frames(1);
    const iso = rig.camera() as THREE.OrthographicCamera;
    const end = {
      target: rig.controls().clone(),
      height: (iso.top - iso.bottom) / iso.zoom,
      dir: rig.controls().clone().sub(iso.position).normalize(),
      pose: rig.pose(),
    };
    await rig.rerender({ exploded: false, gapM: 75, projection, explodeLive: false });
    await frames(3);
    return { rig, end };
  }

  it("hands the perspective camera the collapse's target, direction and framing, then leaves it alone", async () => {
    const { rig, end } = await collapseTo("perspective");
    const persp = rig.camera() as unknown as THREE.PerspectiveCamera;
    expect(persp.isPerspectiveCamera).toBe(true);
    expect(rig.controls().distanceTo(end.target)).toBeLessThan(1e-3);
    const dir = rig.controls().clone().sub(persp.position);
    const height = 2 * dir.length() * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    expect(Math.abs(height - end.height) / end.height).toBeLessThan(0.02);
    expect(dir.normalize().distanceTo(end.dir)).toBeLessThan(1e-3);
    const settled = rig.pose();
    await frames(60);
    expect(rig.pose()).toEqual(settled);
  });

  it("keeps the isometric camera where the collapse ended", async () => {
    const { rig, end } = await collapseTo("iso");
    expect(rig.pose()).toEqual(end.pose);
    await frames(60);
    expect(rig.pose()).toEqual(end.pose);
  });

  it("looks straight down at the same target and zoom for plan, then leaves it alone", async () => {
    const { rig, end } = await collapseTo("plan");
    const ortho = rig.camera() as THREE.OrthographicCamera;
    expect(rig.controls().distanceTo(end.target)).toBeLessThan(1e-3);
    const down = rig.controls().clone().sub(ortho.position).normalize();
    expect(down.y).toBeLessThan(-0.999);
    expect(ortho.zoom).toBeCloseTo(end.pose[6], 6);
    const settled = rig.pose();
    await frames(60);
    rig.pose().forEach((v, k) => expect(v).toBeCloseTo(settled[k], 6));
  });
});

describe("snapshot restores around the exploded axo", () => {
  type Rig = Awaited<ReturnType<typeof mountExplode>>;
  const GAP = 180;

  function poseAt(position: [number, number, number], target: [number, number, number], zoom: number): CameraPose {
    const look = new THREE.Object3D();
    look.position.set(...position);
    look.lookAt(new THREE.Vector3(...target));
    const q = look.quaternion;
    return { position, quaternion: [q.x, q.y, q.z, q.w], up: [0, 1, 0], target, zoom, near: 1, far: 20000 };
  }

  function currentPose(rig: Rig): CameraPose {
    const camera = rig.camera();
    return { ...poseAt([0, 0, 0], [0, 0, 0], 1), ...capturePose(camera, { target: rig.controls() }) };
  }

  function expectPose(rig: Rig, pose: CameraPose) {
    const [px, py, pz, tx, ty, tz, zoom] = rig.pose();
    [px, py, pz].forEach((v, k) => expect(Math.abs(v - pose.position[k])).toBeLessThan(1e-3));
    [tx, ty, tz].forEach((v, k) => expect(Math.abs(v - pose.target[k])).toBeLessThan(1e-3));
    expect(Math.abs(zoom - pose.zoom)).toBeLessThan(1e-3);
  }

  async function restoreTo(rig: Rig, base: Opts, id: number, projection: ProjectionMode, exploded: boolean, pose: CameraPose) {
    const request: CameraRestoreRequest = { id, projection, pose };
    rig.onRestored.mockClear();
    await rig.rerender({ ...base, exploded, projection, snapId: id, restore: request });
    for (let i = 0; i < 90 && !rig.onRestored.mock.calls.some(([done]) => done === id); i++) await frames(1);
    await frames(40);
    return { ...base, exploded, projection, snapId: id, restore: request } satisfies Opts;
  }

  const SEED: Opts = { exploded: false, gapM: GAP, engage: true, projection: "perspective" };

  it("puts a perspective camera back exactly after exporting an exploded iso view", async () => {
    const rig = await mountExplode(SEED);
    await frames(40);
    const original = currentPose(rig);
    const isoView = poseAt([-700, 700, 700], [0, 150, 0], 1.4);
    const exploded = await restoreTo(rig, SEED, 1, "iso", true, isoView);
    expect(rig.canvas.dataset.explodeProgress).toBe("1.000");
    expectPose(rig, isoView);
    await restoreTo(rig, exploded, 2, "perspective", false, original);
    expect(rig.canvas.dataset.explodeProgress).toBe("0.000");
    expect(rig.camera().type).toBe("PerspectiveCamera");
    expectPose(rig, original);
    await frames(60);
    expectPose(rig, original);
  });

  it("puts an exploded iso camera and its gap back exactly after exporting a perspective view", async () => {
    const rig = await mountExplode({ ...SEED, exploded: true, projection: "iso" });
    await frames(40);
    const original = currentPose(rig);
    const trees = layerY(rig.city, "Trees");
    const perspectiveView = poseAt([-900, 800, 900], [0, 100, 0], 1);
    const away = await restoreTo(rig, { ...SEED, exploded: true, projection: "iso" }, 1, "perspective", false, perspectiveView);
    expect(rig.camera().type).toBe("PerspectiveCamera");
    expectPose(rig, perspectiveView);
    await restoreTo(rig, away, 2, "iso", true, original);
    expect(rig.canvas.dataset.explodeProgress).toBe("1.000");
    expect(layerY(rig.city, "Trees")).toBe(trees);
    expect(rig.camera().type).toBe("OrthographicCamera");
    expectPose(rig, original);
  });

  it("lands a click-restore from an exploded view on the saved perspective pose", async () => {
    const rig = await mountExplode({ ...SEED, exploded: true, projection: "iso" });
    await frames(40);
    const saved = poseAt([-500, 500, 500], [10, 120, -20], 1);
    await restoreTo(rig, { ...SEED, exploded: true, projection: "iso" }, 1, "perspective", false, saved);
    expectPose(rig, saved);
    await frames(60);
    expectPose(rig, saved);
  });
});
