import { describe, expect, it } from "vitest";
import {
  buildIsometricDrawing,
  DEFAULT_ISO_CORNER,
  ISO_CORNERS,
  isometricDrawingBounds,
  isoPlanDepth,
  isoWallFacing,
  projectIsoPoint,
  readIsometricDrawingColors,
  type IsoCorner,
} from "./isometricDrawing";
import {
  ISOMETRIC_EXPORT_LAYERS,
  isometricDrawingChunks,
  isometricDrawingPdf,
  isometricDrawingSvg,
} from "./isometricDrawingExport";
import { DEFAULT_VIEW3D_DISPLAY, setLayer3dVisible, type View3dDisplaySettings } from "./view3dDisplay";
import type { CityModel, Pt } from "../types";

const COS30 = Math.sqrt(3) / 2;
const SIN30 = 0.5;

const rectRing = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function sampleIsoModel(): CityModel {
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 101,
        ring: rectRing(-30, -30, -10, -10),
        holes: [],
        height: 15,
        use: "residential",
        source: "osm_tag",
      },
      {
        id: 102,
        ring: rectRing(10, 10, 30, 30),
        holes: [],
        height: 36,
        use: "commercial",
        source: "osm_tag",
      },
    ],
    roads: [
      {
        id: 1,
        kind: "road",
        grade: "local",
        width: 8,
        line: [
          [-45, 0],
          [45, 0],
        ],
      },
      {
        id: 2,
        kind: "road",
        grade: "path",
        width: 2,
        line: [
          [-25, -25],
          [25, -25],
        ],
      },
      {
        id: 3,
        kind: "rail",
        grade: "local",
        width: 4,
        line: [
          [-45, 18],
          [45, 18],
        ],
      },
    ],
    areas: [
      {
        id: 1,
        kind: "green",
        ring: rectRing(-40, 10, -20, 30),
        holes: [],
      },
      {
        id: 2,
        kind: "water",
        ring: rectRing(15, -35, 35, -15),
        holes: [],
      },
    ],
    trees: [
      {
        id: 1,
        at: [0, 0],
        height_m: 10,
        crown_diameter_m: 6,
        trunk_diameter_m: 0.4,
        sizeSource: "osm",
      },
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
      featureCount: 2,
      fetchMs: 10,
      lines: [
        {
          z: 10,
          points: [
            [-40, -40],
            [40, -40],
          ],
        },
        {
          z: 15,
          points: [
            [-40, 20],
            [40, 20],
          ],
        },
      ],
    },
  };
}

describe("isometric 30° projection across NW / NE / SE / SW compass corners", () => {
  it("projects ground axes at 30° (cos 30° = √3/2, sin 30° = 0.5) and vertical upM straight up (-y)", () => {
    expect(DEFAULT_ISO_CORNER).toBe("sw");
    expect(ISO_CORNERS).toEqual(["ne", "nw", "se", "sw"]);

    // Pure vertical displacement shifts SVG y by -upM regardless of compass corner
    for (const corner of ISO_CORNERS) {
      const [x0, y0] = projectIsoPoint(0, 0, 0, corner);
      const [xUp, yUp] = projectIsoPoint(0, 0, 25, corner);
      expect(x0).toBeCloseTo(0, 5);
      expect(y0).toBeCloseTo(0, 5);
      expect(xUp).toBeCloseTo(0, 5);
      expect(yUp).toBeCloseTo(-25, 5);
    }

    // SW corner: viewer sits SW (-east, -north) looking NE, so +east goes up-right and +north goes up-left
    const [swEastX, swEastY] = projectIsoPoint(10, 0, 0, "sw");
    const [swNorthX, swNorthY] = projectIsoPoint(0, 10, 0, "sw");
    expect(swEastX).toBeCloseTo(10 * COS30, 5);
    expect(swEastY).toBeCloseTo(-10 * SIN30, 5);
    expect(swNorthX).toBeCloseTo(-10 * COS30, 5);
    expect(swNorthY).toBeCloseTo(-10 * SIN30, 5);

    // NW corner: viewer sits NW (-east, +north) looking SE, so +east goes up-left and +north goes down-left
    const [nwEastX, nwEastY] = projectIsoPoint(10, 0, 0, "nw");
    const [nwNorthX, nwNorthY] = projectIsoPoint(0, 10, 0, "nw");
    expect(nwEastX).toBeCloseTo(-10 * COS30, 5);
    expect(nwEastY).toBeCloseTo(-10 * SIN30, 5);
    expect(nwNorthX).toBeCloseTo(-10 * COS30, 5);
    expect(nwNorthY).toBeCloseTo(10 * SIN30, 5);

    // NE corner is 180° opposite SW on the ground plane
    const [neEastX, neEastY] = projectIsoPoint(10, 0, 0, "ne");
    expect(neEastX).toBeCloseTo(-swEastX, 5);
    expect(neEastY).toBeCloseTo(-swEastY, 5);

    // SE corner is 180° opposite NW on the ground plane
    const [seEastX, seEastY] = projectIsoPoint(10, 0, 0, "se");
    expect(seEastX).toBeCloseTo(-nwEastX, 5);
    expect(seEastY).toBeCloseTo(-nwEastY, 5);
  });

  it("orders depth from back to front consistently with each compass corner", () => {
    expect(isoPlanDepth(-20, -20, "sw")).toBeGreaterThan(isoPlanDepth(20, 20, "sw"));
    expect(isoPlanDepth(20, 20, "ne")).toBeGreaterThan(isoPlanDepth(-20, -20, "ne"));
    expect(isoPlanDepth(-20, 20, "nw")).toBeGreaterThan(isoPlanDepth(20, -20, "nw"));
    expect(isoPlanDepth(20, -20, "se")).toBeGreaterThan(isoPlanDepth(-20, 20, "se"));
  });

  it("culls back-facing walls and keeps front-facing walls for a building edge", () => {
    // Outward normal (0, -1) faces a SW viewer; outward normal (0, +1) faces away from a SW viewer
    expect(isoWallFacing(0, -1, "sw").visible).toBe(true);
    expect(isoWallFacing(0, 1, "sw").visible).toBe(false);
    // Outward normal (-1, 0) faces left in SW view; outward normal (0, -1) faces right in SW view
    expect(isoWallFacing(-1, 0, "sw")).toEqual({ visible: true, side: "left" });
    expect(isoWallFacing(0, -1, "sw")).toEqual({ visible: true, side: "right" });
  });
});

describe("buildIsometricDrawing 3D extrusion, depth sorting, layer toggles, and colour overrides", () => {
  it("extrudes 3D buildings with visible shaded walls and roof, and depth-sorts solids back-to-front across corners", () => {
    const m = sampleIsoModel();
    const sw = buildIsometricDrawing(m, { corner: "sw" });
    const ne = buildIsometricDrawing(m, { corner: "ne" });

    const swBuildings = sw.solids.filter((s) => s.kind === "building");
    expect(swBuildings).toHaveLength(2);
    for (const b of swBuildings) {
      if (b.kind !== "building") continue;
      expect(b.roofD.length).toBeGreaterThan(10);
      expect(b.walls.length).toBe(2);
      expect(b.roofFill).toBe(sw.colors.buildings);
      for (const wall of b.walls) {
        expect(wall.fill).not.toBe(b.roofFill);
      }
    }

    const swIds = swBuildings.map((s) => (s.kind === "building" ? s.id : -1));
    const neIds = ne.solids.filter((s) => s.kind === "building").map((s) => (s.kind === "building" ? s.id : -1));
    expect(swIds).toEqual([102, 101]);
    expect(neIds).toEqual([101, 102]);
  });

  it("respects Layers visibility toggles from View3dDisplaySettings", () => {
    const m = sampleIsoModel();
    const allOn = buildIsometricDrawing(m, { corner: "nw", display: DEFAULT_VIEW3D_DISPLAY });
    expect(allOn.landscapePaths.length).toBeGreaterThan(0);
    expect(allOn.waterPaths.length).toBeGreaterThan(0);
    expect(allOn.roadPaths.length).toBeGreaterThan(0);
    expect(allOn.footpathPaths.length).toBeGreaterThan(0);
    expect(allOn.railLines.length).toBeGreaterThan(0);
    expect(allOn.contourLines.length).toBeGreaterThan(0);
    expect(allOn.solids.some((s) => s.kind === "building")).toBe(true);
    expect(allOn.solids.some((s) => s.kind === "tree")).toBe(true);

    let allHiddenDisplay: View3dDisplaySettings = DEFAULT_VIEW3D_DISPLAY;
    for (const id of [
      "buildings",
      "roads",
      "footpaths",
      "trees",
      "landscape",
      "water",
      "rail",
      "contours",
    ] as const) {
      allHiddenDisplay = setLayer3dVisible(allHiddenDisplay, id, false);
    }

    const hidden = buildIsometricDrawing(m, {
      corner: "nw",
      display: allHiddenDisplay,
    });
    expect(hidden.landscapePaths).toHaveLength(0);
    expect(hidden.waterPaths).toHaveLength(0);
    expect(hidden.roadPaths).toHaveLength(0);
    expect(hidden.roadCenterlines).toHaveLength(0);
    expect(hidden.footpathPaths).toHaveLength(0);
    expect(hidden.railLines).toHaveLength(0);
    expect(hidden.tramLines).toHaveLength(0);
    expect(hidden.contourLines).toHaveLength(0);
    expect(hidden.solids).toHaveLength(0);
  });

  it("propagates custom layer colours to buildings (roof + shaded walls), trees, and ground layers", () => {
    const m = sampleIsoModel();
    const baseColors = readIsometricDrawingColors();
    const customBuilding = `rgb(212, 136, 85)`;
    const customTree = `rgb(45, 122, 71)`;
    const iso = buildIsometricDrawing(m, {
      corner: "se",
      colors: {
        ...baseColors,
        buildings: customBuilding,
        trees: customTree,
      },
    });
    const b = iso.solids.find((s) => s.kind === "building");
    const t = iso.solids.find((s) => s.kind === "tree");
    expect(b?.kind === "building" && b.roofFill).toBe(customBuilding);
    expect(t?.kind === "tree" && t.canopyFill).toBe(customTree);
  });

  it("computes finite isometric drawing bounds for every compass corner", () => {
    const m = sampleIsoModel();
    for (const corner of ISO_CORNERS as readonly IsoCorner[]) {
      const bounds = isometricDrawingBounds(m, corner);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
    }
  });
});

describe("isometricDrawingExport (.svg and .ai / PDF vector exports)", () => {
  it("builds layered vector chunks, SVG, and PDF/AI documents reflecting compass corner and layer toggles", async () => {
    const m = sampleIsoModel();
    const { chunks } = isometricDrawingChunks(m, 2500, { corner: "nw" });
    const names = chunks.map((c) => c.name);
    expect(names).toContain("Frame");
    expect(names).toContain("Landscape");
    expect(names).toContain("Water");
    expect(names).toContain("Footpaths");
    expect(names).toContain("Contours");
    expect(names).toContain("Roads");
    expect(names).toContain("Rail & tram");
    expect(names).toContain("Buildings & trees");
    expect(names).toContain("Annotation");
    for (const name of names) {
      expect(ISOMETRIC_EXPORT_LAYERS).toContain(name);
    }

    const svg = await isometricDrawingSvg(m, 2500, { corner: "nw" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("Isometric (NW)");
    expect(svg).toContain('id="Buildings_trees"');

    const pdfBytes = await isometricDrawingPdf(m, 2500, { corner: "sw" });
    const pdfHeader = new TextDecoder("latin1").decode(pdfBytes.slice(0, 8));
    expect(pdfHeader.startsWith("%PDF-")).toBe(true);

    let noSolidsDisplay = setLayer3dVisible(DEFAULT_VIEW3D_DISPLAY, "buildings", false);
    noSolidsDisplay = setLayer3dVisible(noSolidsDisplay, "trees", false);
    const noSolids = isometricDrawingChunks(m, 2500, {
      corner: "nw",
      display: noSolidsDisplay,
    });
    expect(noSolids.chunks.map((c) => c.name)).not.toContain("Buildings & trees");
  });
});
