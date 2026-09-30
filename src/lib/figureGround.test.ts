import { describe, expect, it } from "vitest";
import { signedArea } from "./geo";
import {
  A3_LONG_MM,
  A3_SHORT_MM,
  figureGround,
  figureGroundPdf,
  figureGroundSvg,
  layoutSheet,
  maxFrameMm,
  paperMillimetres,
  preferredFigureScale,
  scaleBarMetres,
  sheetFitMessage,
} from "./figureGround";
import { mmToPt } from "./pdfSheet";
import type { BuildingFeat, CityModel, Pt } from "../types";

function square(minX: number, minY: number, maxX: number, maxY: number): Pt[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function footprint(ring: Pt[], holes: Pt[][] = []): BuildingFeat {
  return { id: 1, ring, holes, height: 9, use: "unclassified", source: "none" };
}

function ringArea(ring: Pt[]): number {
  return Math.abs(signedArea(ring));
}

function polygonArea(polygon: Pt[][]): number {
  return ringArea(polygon[0]) - polygon.slice(1).reduce((sum, hole) => sum + ringArea(hole), 0);
}

function contains(polygon: Pt[][], x: number, y: number): boolean {
  const inside = (ring: Pt[]) => {
    const open =
      ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;
    let hit = false;
    for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
      const yi = open[i][1];
      const yj = open[j][1];
      const xi = open[i][0];
      const xj = open[j][0];
      const cross = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (cross) hit = !hit;
    }
    return hit;
  };
  if (!inside(polygon[0])) return false;
  return !polygon.slice(1).some((hole) => inside(hole));
}

function seamAlong(polygons: Pt[][][], x: number, y0: number, y1: number): boolean {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (Math.abs(a[0] - x) > 1e-6 || Math.abs(b[0] - x) > 1e-6) continue;
        const low = Math.min(a[1], b[1]);
        const high = Math.max(a[1], b[1]);
        if (Math.min(high, y1) - Math.max(low, y0) > 1e-4) return true;
      }
    }
  }
  return false;
}

describe("figure-ground union and clipping", () => {
  it("unions overlapping footprints into one polygon without double-counting the overlap", () => {
    const ground = figureGround(
      [footprint(square(0, 0, 10, 10)), footprint(square(5, 0, 15, 10))],
      100,
    );
    expect(ground.before).toBe(2);
    expect(ground.after).toBe(1);
    expect(polygonArea(ground.polygons[0])).toBeCloseTo(150, 3);
    expect(contains(ground.polygons[0], 2, 5)).toBe(true);
    expect(contains(ground.polygons[0], 12, 5)).toBe(true);
    expect(contains(ground.polygons[0], 7, 5)).toBe(true);
  });

  it("unions edge-touching footprints and drops the shared wall", () => {
    const ground = figureGround(
      [
        footprint(square(0, 0, 10, 10)),
        footprint(square(10, 0, 20, 10)),
        footprint(square(20, 0, 30, 10)),
      ],
      100,
    );
    expect(ground.before).toBe(3);
    expect(ground.after).toBe(1);
    expect(polygonArea(ground.polygons[0])).toBeCloseTo(300, 3);
    expect(ground.polygons[0].length).toBe(1);
    expect(seamAlong(ground.polygons, 10, 0.1, 9.9)).toBe(false);
    expect(seamAlong(ground.polygons, 20, 0.1, 9.9)).toBe(false);
    expect(contains(ground.polygons[0], 5, 5)).toBe(true);
    expect(contains(ground.polygons[0], 15, 5)).toBe(true);
    expect(contains(ground.polygons[0], 25, 5)).toBe(true);
  });

  it("keeps a courtyard white and still unions a neighbour", () => {
    const ground = figureGround(
      [
        footprint(square(0, 0, 30, 30), [square(10, 10, 20, 20)]),
        footprint(square(40, 0, 50, 10)),
      ],
      100,
    );
    expect(ground.after).toBe(2);
    const holed = ground.polygons.find((polygon) => polygon.length > 1);
    const solid = ground.polygons.find((polygon) => polygon.length === 1);
    expect(holed).toBeTruthy();
    expect(solid).toBeTruthy();
    expect(polygonArea(holed!)).toBeCloseTo(800, 3);
    expect(contains(holed!, 5, 5)).toBe(true);
    expect(contains(holed!, 15, 15)).toBe(false);
    expect(contains(solid!, 45, 5)).toBe(true);
  });

  it("fills a courtyard when another footprint covers the hole", () => {
    const ground = figureGround(
      [footprint(square(0, 0, 30, 30), [square(10, 10, 20, 20)]), footprint(square(10, 10, 20, 20))],
      100,
    );
    expect(ground.after).toBe(1);
    expect(ground.polygons[0].length).toBe(1);
    expect(polygonArea(ground.polygons[0])).toBeCloseTo(900, 3);
    expect(contains(ground.polygons[0], 15, 15)).toBe(true);
  });

  it("clips a footprint to the cut and drops one that misses the frame", () => {
    const ground = figureGround(
      [footprint(square(5, 5, 25, 15)), footprint(square(50, 50, 58, 58))],
      20,
    );
    expect(ground.before).toBe(2);
    expect(ground.after).toBe(1);
    expect(polygonArea(ground.polygons[0])).toBeCloseTo(25, 3);
    for (const ring of ground.polygons[0]) {
      for (const point of ring) {
        expect(point[0]).toBeGreaterThanOrEqual(-10 - 1e-6);
        expect(point[0]).toBeLessThanOrEqual(10 + 1e-6);
        expect(point[1]).toBeGreaterThanOrEqual(-10 - 1e-6);
        expect(point[1]).toBeLessThanOrEqual(10 + 1e-6);
      }
    }
  });

  it("clips an outer ring to the frame and keeps a courtyard inside it", () => {
    const ground = figureGround([footprint(square(-30, -30, 30, 30), [square(-5, -5, 5, 5)])], 40);
    expect(ground.after).toBe(1);
    expect(ground.polygons[0].length).toBe(2);
    expect(polygonArea(ground.polygons[0])).toBeCloseTo(1600 - 100, 3);
    expect(contains(ground.polygons[0], 0, 0)).toBe(false);
    expect(contains(ground.polygons[0], 15, 0)).toBe(true);
    for (const ring of ground.polygons[0]) {
      for (const point of ring) {
        expect(Math.abs(point[0])).toBeLessThanOrEqual(20 + 1e-6);
        expect(Math.abs(point[1])).toBeLessThanOrEqual(20 + 1e-6);
      }
    }
  });

  it("leaves detached footprints as separate polygons", () => {
    const ground = figureGround([footprint(square(0, 0, 10, 10)), footprint(square(30, 0, 40, 10))], 100);
    expect(ground.after).toBe(2);
    expect(ground.polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0)).toBeCloseTo(200, 3);
  });
});

describe("figure-ground scale", () => {
  it("converts ground metres to paper millimetres", () => {
    expect(paperMillimetres(1, 1000)).toBe(1);
    expect(paperMillimetres(1000, 1000)).toBe(1000);
    expect(paperMillimetres(1000, 2500)).toBe(400);
    expect(paperMillimetres(250, 500)).toBe(500);
    expect(mmToPt(25.4)).toBeCloseTo(72, 8);
  });

  it("picks landscape A3 when the square fits, and portrait when only that does", () => {
    expect(maxFrameMm("landscape")).toBeCloseTo(269, 6);
    expect(maxFrameMm("portrait")).toBeCloseTo(277, 6);
    const fitting = layoutSheet(1000, 5000);
    expect(fitting.frameMm).toBe(200);
    expect(fitting.fitsOnA3).toBe(true);
    expect(fitting.orientation).toBe("landscape");
    expect(fitting.pageWidthMm).toBe(A3_LONG_MM);
    expect(fitting.pageHeightMm).toBe(A3_SHORT_MM);
    const taller = layoutSheet(675, 2500);
    expect(taller.frameMm).toBe(270);
    expect(taller.fitsOnA3).toBe(true);
    expect(taller.orientation).toBe("portrait");
    expect(taller.pageWidthMm).toBe(A3_SHORT_MM);
    expect(taller.pageHeightMm).toBe(A3_LONG_MM);
  });

  it("says when a 1 km frame does not fit A3 at 1:1000 or 1:2500", () => {
    const fine = layoutSheet(1000, 1000);
    const mid = layoutSheet(1000, 2500);
    expect(fine.fitsOnA3).toBe(false);
    expect(fine.frameMm).toBe(1000);
    expect(mid.fitsOnA3).toBe(false);
    expect(mid.frameMm).toBe(400);
    expect(mid.pageWidthMm).toBe(420);
    expect(mid.pageHeightMm).toBe(428);
    expect(sheetFitMessage(1000, 2500)).toMatch(/does not fit on A3/i);
    expect(sheetFitMessage(1000, 2500)).toMatch(/400 mm/);
    expect(sheetFitMessage(1000, 5000)).toBeNull();
    expect(preferredFigureScale(1000)).toBe(5000);
    expect(preferredFigureScale(200)).toBe(1000);
    expect(preferredFigureScale(100)).toBe(500);
  });

  it("keeps the scale bar and the notes outside the cut, at the bar's true length", () => {
    const layout = layoutSheet(1000, 2500);
    expect(layout.barMetres).toBe(100);
    expect(layout.barMm).toBeCloseTo(paperMillimetres(100, 2500), 6);
    expect(layout.barY).toBeGreaterThanOrEqual(layout.frameY + layout.frameMm - 1e-6);
    expect(layout.northTipY).toBeGreaterThanOrEqual(layout.frameY + layout.frameMm - 1e-6);
    expect(layout.titleY).toBeGreaterThan(layout.frameY + layout.frameMm);
    expect(layout.frameX).toBeGreaterThanOrEqual(layout.edgeMm - 1e-6);
    expect(layout.frameX + layout.frameMm).toBeLessThanOrEqual(layout.pageWidthMm - layout.edgeMm + 1e-6);
    expect(scaleBarMetres(1000)).toBe(200);
  });
});

function model(): CityModel {
  return {
    placeLabel: "Test Block",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 200,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [footprint(square(-20, -20, 20, 20), [square(-5, -5, 5, 5)])],
    roads: [{ id: 2, line: [[-80, 0], [80, 0]], width: 8, kind: "road", grade: "arterial" }],
    areas: [{ id: 3, ring: square(-40, -40, -30, -30), holes: [], kind: "green" }],
    trees: [{ id: 4, at: [20, 30], height_m: 10, crown_diameter_m: 8, trunk_diameter_m: 0.3, sizeSource: "osm" }],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "OpenStreetMap via Overpass.",
    contours: true,
  };
}

function pathBox(svg: string): { width: number; height: number } {
  const match = svg.match(/<path d="([^"]+)"/);
  expect(match).toBeTruthy();
  const values = match![1].match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i += 2) {
    xs.push(values[i]);
    ys.push(values[i + 1]);
  }
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

describe("figure-ground sheet", () => {
  it("draws the footprint at true scale and leaves roads, trees, and colour off the sheet", () => {
    const svg = figureGroundSvg(model(), 1000);
    const box = pathBox(svg);
    expect(box.width).toBeCloseTo(40, 2);
    expect(box.height).toBeCloseTo(40, 2);
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('height="297mm"');
    expect(svg).toContain('id="cut"');
    expect(svg).toMatch(/id="cut"[^>]*width="200"/);
    expect(svg).toContain("Test Block");
    expect(svg).toContain("-37.81360, 144.96310");
    expect(svg).toContain("1:1000");
    expect(svg).toContain("A3 landscape");
    expect(svg).toContain("OpenStreetMap");
    expect(svg).toContain('id="scale-bar"');
    expect(svg).toContain('id="north-arrow"');
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("#b7d39a");
    expect(svg).not.toContain("#3a3a3a");
    const cut = svg.match(/id="cut" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    const notes = svg.match(/id="sheet-title" x="[\d.]+" y="([\d.]+)"/);
    const bar = svg.match(/id="scale-bar">\s*<rect x="[\d.]+" y="([\d.]+)"/);
    expect(cut).toBeTruthy();
    expect(notes).toBeTruthy();
    expect(bar).toBeTruthy();
    const frameBottom = Number(cut![2]) + Number(cut![4]);
    expect(Number(notes![1])).toBeGreaterThan(frameBottom);
    expect(Number(bar![1])).toBeGreaterThanOrEqual(frameBottom - 0.01);
  });

  it("scales the same footprint to 16 mm at 1:2500 and warns that 1 km does not fit", () => {
    const svg = figureGroundSvg(model(), 2500);
    const box = pathBox(svg);
    expect(box.width).toBeCloseTo(16, 2);
    expect(box.height).toBeCloseTo(16, 2);
    const wide = figureGroundSvg({ ...model(), sideM: 1000, buildings: [] }, 2500);
    expect(wide).toContain("Does not fit on A3");
    expect(wide).toContain("1:2500");
    expect(wide).toContain('width="420mm"');
    expect(wide).toContain('height="428mm"');
  });

  it("writes a PDF with the same scale, name, centre, and attribution", () => {
    const pdf = figureGroundPdf(model(), 1000);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("Test Block");
    expect(text).toContain("1:1000");
    expect(text).toContain("-37.81360, 144.96310");
    expect(text).toContain("OpenStreetMap");
    expect(text).toContain(`/MediaBox [0 0 ${Math.round(mmToPt(420) * 100) / 100} ${Math.round(mmToPt(297) * 100) / 100}]`);
    const start = text.match(/startxref\n(\d+)\n%%EOF/);
    expect(start).toBeTruthy();
    expect(text.slice(Number(start![1]), Number(start![1]) + 5)).toBe("xref\n");
    const length = text.match(/\/Length (\d+)/);
    const streamAt = text.indexOf("stream\n") + "stream\n".length;
    const streamEnd = text.indexOf("endstream", streamAt);
    expect(streamEnd - streamAt).toBe(Number(length![1]));
    const overflow = figureGroundPdf({ ...model(), sideM: 1000 }, 2500);
    const overflowText = new TextDecoder("latin1").decode(overflow);
    expect(overflowText).toContain("Does not fit on A3");
    expect(overflowText).toContain("1:2500");
  });
});
