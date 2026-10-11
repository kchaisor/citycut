import { describe, expect, it } from "vitest";
import * as polygonClipping from "polygon-clipping";
import type { MultiPolygon, Pair } from "polygon-clipping";
import { readFileSync } from "node:fs";
import { signedArea } from "./geo";
import { computeCityBlocks } from "./cityBlocks";
import { normalizeMultiPolygonByParity, offsetMultiPolygon } from "./polygonOffset";
import { clearFootpathUnionCacheForTests, PARKING_AISLE, unionCarriageways, unionRoadSurface } from "./roadFill";
import { fillRoadMedianGaps, ROAD_MEDIAN_HOLE_MAX_M2 } from "./roadMedianFill";
import { serviceKindOfSegment } from "./overtureTransportMapping";
import { carParkWays } from "./planCarParks";
import { planPaths } from "./svgPlan";
import { PATH_WIDTH_M } from "./lineweights";
import type { CityModel, Pt } from "../types";

const pc = ((polygonClipping as unknown as { default?: typeof polygonClipping }).default ?? polygonClipping) as typeof polygonClipping;
const rect = (x0: number, y0: number, x1: number, y1: number): Pair[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const ringArea = (ring: Pair[]) => Math.abs(signedArea(ring.slice(0, -1) as Pt[]));
const area = (multi: MultiPolygon) =>
  multi.reduce((sum, poly) => sum + poly.reduce((s, ring, i) => s + (i === 0 ? 1 : -1) * ringArea(ring), 0), 0);
const asMulti = (polys: Pt[][][]): MultiPolygon => polys.map((rings) => rings.map((ring) => ring.map((p): Pair => [p[0], p[1]])));
const inRing = (p: Pair, ring: Pair[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
/** Point inside the multipolygon (outer ring in, no hole of that polygon contains it). */
const covers = (multi: MultiPolygon, p: Pair) =>
  multi.some((poly) => inRing(p, poly[0]!) && !poly.slice(1).some((hole) => inRing(p, hole)));

describe("normalizeMultiPolygonByParity", () => {
  it("keeps a hole whose vertex average falls inside one of its own islands", () => {
    // Road ring around a 180 m block; an isolated car-park aisle loop sits in the middle of the block.
    const rings: MultiPolygon = [[rect(0, 0, 200, 200), rect(10, 10, 190, 190)], [rect(90, 90, 110, 110), rect(95, 95, 105, 105)]];
    const out = normalizeMultiPolygonByParity(rings);
    expect(area(out)).toBeCloseTo(200 * 200 - 180 * 180 + 20 * 20 - 10 * 10, 3);
    expect(covers(out, [50, 50])).toBe(false);
    expect(covers(out, [100, 100])).toBe(false);
    expect(covers(out, [92, 100])).toBe(true);
    // The morphological close (offset +r then -r) must not fill the block either.
    expect(covers(offsetMultiPolygon(offsetMultiPolygon(rings, 3), -3), [50, 50])).toBe(false);
  });
});

describe("serviceKindOfSegment", () => {
  it("tags Overture service ways with their subclass", () => {
    expect(serviceKindOfSegment({ subtype: "road", class: "service", subclass: "parking_aisle" })).toBe("parking_aisle");
    expect(serviceKindOfSegment({ subtype: "road", class: "service" })).toBe("service");
    expect(serviceKindOfSegment({ subtype: "road", class: "residential" })).toBeNull();
    expect(serviceKindOfSegment({ subtype: "rail", class: "service" })).toBeNull();
  });
});

describe("carParkWays", () => {
  const park = { ring: [[0, 0], [100, 0], [100, 60], [0, 60], [0, 0]] as Pt[], holes: [] };
  const way = (line: Pt[], service?: string) => ({ id: 1, line, width: 3.2, kind: "road" as const, grade: "local" as const, ...(service ? { service } : {}) });
  it("takes every parking aisle, and plain service ways that run inside a car park", () => {
    const aisle = way([[500, 500], [600, 500]], "parking_aisle");
    const inside = way([[10, 30], [90, 30]], "service");
    const through = way([[-200, 30], [50, 30]], "service");
    const street = way([[10, 20], [90, 20]]);
    const out = carParkWays([aisle, inside, through, street], [park]);
    expect([...out]).toEqual([aisle, inside]);
    expect([...carParkWays([aisle, inside], undefined)]).toEqual([aisle]);
  });
});

describe("fillRoadMedianGaps street rim", () => {
  const none = { green: [], water: [], paths: [], buildings: [] };
  // 100 x 30 m road with an 80 x 6 m hole between y 12 and 18.
  const road: MultiPolygon = [[rect(0, 0, 100, 30), rect(10, 12, 90, 18)]];
  it("fills a hole rimmed by streets (a median)", () => {
    const streets = [{ line: [[0, 6], [100, 6]] as Pt[], width: 12 }, { line: [[0, 24], [100, 24]] as Pt[], width: 12 }];
    expect(area(fillRoadMedianGaps(road, none, ROAD_MEDIAN_HOLE_MAX_M2, streets))).toBeCloseTo(3000, 3);
  });
  it("leaves a hole rimmed by service ways (a car-park bay) as ground", () => {
    const streets = [{ line: [[0, 6], [100, 6]] as Pt[], width: 12 }];
    expect(fillRoadMedianGaps(road, none, ROAD_MEDIAN_HOLE_MAX_M2, streets)).toEqual(road);
  });
});

describe("Dandenong site plan ground (40 Cleeland St, Overture 2026-09-23.1)", () => {
  const raw = readFileSync(new URL("./fixtures/dandenong-cleeland-ground.json", import.meta.url), "utf8");
  const model = JSON.parse(raw) as CityModel;
  model.blocks = computeCityBlocks(model);
  clearFootpathUnionCacheForTests();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 5000, 5, 2500, { pathFilletM: 2 });
  const roadFill = plan.roadFill as MultiPolygon;
  const ground = asMulti(plan.blocks);
  const aisles = model.roads.filter((road) => road.service === PARKING_AISLE);
  const carPark = [...carParkWays(model.roads, model.carParks)];

  it("has the shopping-centre block and the park car park in the fixture", () => {
    expect(aisles.length).toBeGreaterThan(40);
    expect(model.carParks?.length).toBeGreaterThan(5);
    expect(carPark.length).toBeGreaterThan(aisles.length);
    expect(model.buildings.length).toBeGreaterThan(100);
  });

  it("does not paint the shopping-centre block or the park car park as road", () => {
    // Open ground inside the shopping-centre block (was a ~95,000 m² road-white fill on main).
    for (const p of [[103, -314], [200, -250], [250, -300]] as Pair[]) {
      expect(covers(roadFill, p), `road at ${p}`).toBe(false);
      expect(covers(ground, p), `ground at ${p}`).toBe(true);
    }
    // Car-park bays east of the site, by the park (gap-filled white by #74 on main).
    // [119, 37] and [110, 3] sit on car-park rows mapped as plain service ways inside the car park.
    for (const p of [[77, 12], [93, 62], [89, 46], [75, -2], [86, 31], [119, 37], [110, 3]] as Pair[]) {
      expect(covers(roadFill, p), `road at ${p}`).toBe(false);
      expect(covers(ground, p), `ground at ${p}`).toBe(true);
    }
  });

  it("draws car-park aisles (and service ways inside car parks) as ground, not road", () => {
    const strips = unionCarriageways(carPark, model.sideM, "square").polygons;
    const streetSurface = unionCarriageways(
      model.roads.filter((r) => r.kind === "road" && r.grade !== "path" && !carPark.includes(r)),
      model.sideM,
      "square",
    ).polygons;
    const aisleOnly = pc.difference(strips, offsetMultiPolygon(streetSurface, 3.5));
    expect(area(aisleOnly)).toBeGreaterThan(5000);
    expect(area(pc.intersection(aisleOnly, roadFill))).toBeLessThan(1);
    let uncovered = aisleOnly;
    for (const poly of ground) uncovered = uncovered.length > 0 ? pc.difference(uncovered, [poly]) : uncovered;
    expect(area(uncovered)).toBeLessThan(1);
  });

  it("keeps road white off every block larger than a median (outside the 3.5 m close band)", () => {
    const big = model.blocks!.filter((b) => ringArea(b.ring.map((p): Pair => [p[0], p[1]])) > ROAD_MEDIAN_HOLE_MAX_M2);
    const inner = offsetMultiPolygon(asMulti(big.map((b) => [b.ring, ...b.holes])), -3.5);
    expect(area(pc.intersection(inner, roadFill))).toBeLessThan(1);
  });

  it("fills only street-rimmed gaps on top of the plan carriageway (no car-park ways)", () => {
    const surface = unionRoadSurface(model.roads.filter((r) => !carPark.includes(r)), model.tramLines, model.sideM, "square").polygons;
    const filled = pc.difference(roadFill, surface);
    expect(area(filled)).toBeLessThan(1500);
  });
});
