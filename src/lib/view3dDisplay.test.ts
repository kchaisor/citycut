import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW3D_DISPLAY,
  DEFAULT_VIEW3D_LAYERS_VISIBLE,
  LAYER_3D_IDS,
  isLayer3dVisible,
  readStoredView3dDisplay,
  setLayer3dVisible,
  snapWhenTogglingView3dDisplay,
  view3dDisplayForModelOpen,
  writeStoredView3dDisplay,
  type View3dDisplaySettings,
} from "./view3dDisplay";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

describe("view3d display defaults and persistence", () => {
  it("omits ground and defaults all 3D layers (including Contours and Trees) to ON", () => {
    expect(LAYER_3D_IDS).not.toContain("ground");
    expect(DEFAULT_VIEW3D_DISPLAY.showContours3d).toBe(true);
    expect(DEFAULT_VIEW3D_DISPLAY.hideTrees).toBe(false);
    for (const id of LAYER_3D_IDS) {
      expect(DEFAULT_VIEW3D_LAYERS_VISIBLE[id]).toBe(true);
      expect(isLayer3dVisible(DEFAULT_VIEW3D_DISPLAY, id)).toBe(true);
    }
  });

  it("round-trips display toggles and layer visibility in storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    let saved: View3dDisplaySettings = {
      ...DEFAULT_VIEW3D_DISPLAY,
      whiteCard: true,
      showContours3d: false,
      hideTrees: true,
      layersVisible: {
        ...DEFAULT_VIEW3D_LAYERS_VISIBLE,
        contours: false,
        trees: false,
        buildings: false,
        roads: false,
      },
    };
    writeStoredView3dDisplay(storage, saved);
    expect(readStoredView3dDisplay(storage)).toEqual(saved);

    saved = setLayer3dVisible(saved, "trees", true);
    expect(saved.hideTrees).toBe(false);
    expect(isLayer3dVisible(saved, "trees")).toBe(true);

    saved = setLayer3dVisible(saved, "contours", true);
    expect(saved.showContours3d).toBe(true);
    expect(isLayer3dVisible(saved, "contours")).toBe(true);
  });

  it("resets all 3D layers to ON when a model opens while keeping view mode preferences", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    writeStoredView3dDisplay(storage, {
      whiteCard: true,
      showOutlines: false,
      showContours3d: false,
      hideTrees: true,
      layersVisible: {
        ...DEFAULT_VIEW3D_LAYERS_VISIBLE,
        buildings: false,
        roads: false,
        water: false,
        contours: false,
        trees: false,
      },
    });
    const opened = view3dDisplayForModelOpen(storage);
    expect(opened.whiteCard).toBe(true);
    expect(opened.showOutlines).toBe(false);
    for (const id of LAYER_3D_IDS) {
      expect(isLayer3dVisible(opened, id)).toBe(true);
    }
  });
});

describe("view3d display toggles camera unchanged", () => {
  it("never snaps the camera when a display toggle changes", () => {
    expect(snapWhenTogglingView3dDisplay()).toBe(false);
  });

  it("does not call setSnapId from display toggle handlers", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    const block = page.match(/commitView3dDisplay[\s\S]{0,2000}function commitView/)?.[0] ?? "";
    expect(block).not.toContain("setSnapId");
    expect(page.match(/commitView3dDisplay\(\{[\s\S]*?\}\)/g)?.join("\n") ?? "").not.toContain("setSnapId");
  });
});

import * as THREE from "three";
import { buildCityGroup } from "./buildCity";
import { addBuildingEdges } from "./buildingEdges";
import { buildContourLineObject } from "./contourLines3d";
import type { CityModel, Pt } from "../types";

describe("3D layer visibility across buildCityGroup meshes", () => {
  const ring = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];

  function applyCityVisibility(group: THREE.Group, display: View3dDisplaySettings) {
    const buildingsVisible = isLayer3dVisible(display, "buildings");
    const roadsVisible = isLayer3dVisible(display, "roads");
    const footpathsVisible = isLayer3dVisible(display, "footpaths");
    const landscapeVisible = isLayer3dVisible(display, "landscape");
    const waterVisible = isLayer3dVisible(display, "water");
    const blocksVisible = isLayer3dVisible(display, "blocks");
    const railVisible = isLayer3dVisible(display, "rail");
    group.traverse((object) => {
      const name = object.name;
      if (name === "BuildingEdges") {
        object.visible = display.showOutlines && buildingsVisible;
        return;
      }
      if (
        name === "Buildings" ||
        name === "Buildings-manual" ||
        name === "Buildings-site" ||
        name.startsWith("Buildings::") ||
        name.startsWith("source:")
      ) {
        object.visible = buildingsVisible;
        return;
      }
      if (name === "Roads") {
        const grade = object.userData?.roadGrade;
        object.visible = grade === "path" ? footpathsVisible : roadsVisible;
        return;
      }
      if (name === "Green") {
        object.visible = landscapeVisible;
        return;
      }
      if (name === "Water") {
        object.visible = waterVisible;
        return;
      }
      if (name === "Blocks") {
        object.visible = blocksVisible;
        return;
      }
      if (name === "RailLines" || name === "TramLines") {
        object.visible = railVisible;
        return;
      }
      if (name === "GroundEdge") {
        object.visible = display.showOutlines;
      }
    });
    const trees = group.getObjectByName("Trees");
    if (trees) trees.visible = isLayer3dVisible(display, "trees");
  }

  it("defaults all 3D layers ON while keeping Ground visible and toggles every 3D layer independently", () => {
    const model: CityModel = {
      placeLabel: "Test",
      center: { lon: 145, lat: -37.8 },
      sideM: 500,
      layers: { buildings: true, roads: true, waterGreen: true, trees: true },
      buildings: [
        { id: 1, ring: ring(-10, -10, 10, 10), holes: [], height: 12, use: "residential", source: "osm_tag" },
      ],
      roads: [
        { id: 1, kind: "road", grade: "local", width: 8, line: [[-40, 0], [40, 0]] },
        { id: 2, kind: "road", grade: "path", width: 2, line: [[-20, -20], [20, -20]] },
        { id: 3, kind: "rail", grade: "local", width: 4, line: [[-50, 10], [50, 10]] },
      ],
      areas: [
        { id: 1, kind: "green", ring: ring(-30, -30, -15, -15), holes: [] },
        { id: 2, kind: "water", ring: ring(15, -30, 30, -15), holes: [] },
      ],
      trees: [
        { id: 1, at: [5, 5], height_m: 9, crown_diameter_m: 6, trunk_diameter_m: 0.4, sizeSource: "osm" },
      ],
      blocks: [
        { id: 10, kind: "block", ring: ring(-45, -45, -35, -35), holes: [] },
      ],
      roadKm: 0.1,
      buildingCapHit: false,
      sourceNote: "",
      contourLayer: {
        source: "vicmap-metro",
        label: "Vicmap Elevation 1 m",
        interval: 1,
        attribution: null,
        datasetUrl: null,
        featureCount: 1,
        fetchMs: 5,
        lines: [{ z: 10, points: [[-30, -30], [30, 30]] }],
      },
    };

    const group = buildCityGroup(model, { uniformBuildings: true });
    addBuildingEdges(group);

    let display = { ...DEFAULT_VIEW3D_DISPLAY };
    applyCityVisibility(group, display);
    expect(buildContourLineObject(model)).not.toBeNull();

    const roadMeshes: THREE.Object3D[] = [];
    const pathMeshes: THREE.Object3D[] = [];
    group.traverse((o) => {
      if (o.name === "Roads") {
        if (o.userData?.roadGrade === "path") pathMeshes.push(o);
        else roadMeshes.push(o);
      }
    });
    expect(roadMeshes.length).toBeGreaterThan(0);
    expect(pathMeshes.length).toBeGreaterThan(0);

    // By default: all 3D layers and Ground start ON
    expect(roadMeshes.every((m) => m.visible)).toBe(true);
    expect(pathMeshes.every((m) => m.visible)).toBe(true);
    expect(group.getObjectByName("Water")?.visible).toBe(true);
    expect(group.getObjectByName("Ground")?.visible).toBe(true);
    expect(group.getObjectByName("Buildings")?.visible).toBe(true);
    expect(group.getObjectByName("Green")?.visible).toBe(true);
    expect(group.getObjectByName("Blocks")?.visible).toBe(true);
    expect(group.getObjectByName("RailLines")?.visible).toBe(true);
    expect(group.getObjectByName("Trees")?.visible).toBe(true);

    // Toggling footpaths off keeps street roads visible
    display = setLayer3dVisible(display, "footpaths", false);
    applyCityVisibility(group, display);
    expect(roadMeshes.every((m) => m.visible)).toBe(true);
    expect(pathMeshes.every((m) => !m.visible)).toBe(true);

    // Toggling roads off hides street roads
    display = setLayer3dVisible(display, "roads", false);
    applyCityVisibility(group, display);
    expect(roadMeshes.every((m) => !m.visible)).toBe(true);

    // Toggling buildings off hides Buildings and BuildingEdges
    display = setLayer3dVisible(display, "buildings", false);
    applyCityVisibility(group, display);
    expect(group.getObjectByName("Buildings")?.visible).toBe(false);
    expect(group.getObjectByName("BuildingEdges")?.visible).toBe(false);

    // Toggling landscape, water, blocks, rail, trees off hides their objects while Ground stays visible
    for (const [id, objName] of [
      ["landscape", "Green"],
      ["water", "Water"],
      ["blocks", "Blocks"],
      ["rail", "RailLines"],
      ["trees", "Trees"],
    ] as const) {
      display = setLayer3dVisible(display, id, false);
      applyCityVisibility(group, display);
      expect(group.getObjectByName(objName)?.visible).toBe(false);
    }
    expect(group.getObjectByName("Ground")?.visible).toBe(true);
  });
});
