import { beforeEach, describe, expect, it } from "vitest";
import rhino3dm from "rhino3dm";
import { parseMassing3dm, mgaPlacement, type ImportedMassing } from "./massingImport";
import { massingDrawingBuildings } from "./massingFootprint";
import { clearPlanShadowCache, planShadowOffset, planShadowRings } from "./buildingShadows";
import { sampleTerrain } from "./terrain";
import { sunAtMelbourneLocal } from "./solar";
import { projectLocal } from "./crs";
import type { BuildingFeat, CityModel, Pt, TerrainField } from "../types";

/** Dandenong Market cut, Winter 22 Jun public-spaces preset, 11:00 AEST. */
const origin = { lon: 145.21555, lat: -37.98382 };
const zone = 55;
const when = { lat: origin.lat, lon: origin.lon, year: 2026, month: 6, day: 22, hour: 11, minute: 0 };
const sideM = 400;

function flatTerrain(z: number): TerrainField {
  return { cols: 3, rows: 3, heights: new Float32Array(9).fill(z), min: z, max: z, spacingM: sideM / 2, zoom: 15, metresPerPixel: 1, source: "test" };
}

/** A real .3dm in MGA 2020 with a 20 × 20 m box from `bottom` to `top` m AHD, base centre at local `at`. */
async function importBox(at: Pt, bottom: number, top: number): Promise<ImportedMassing> {
  const r = await (rhino3dm as unknown as () => Promise<any>)();
  const [E, N] = projectLocal(at, origin, zone);
  const doc = new r.File3dm();
  doc.settings().modelUnitSystem = r.UnitSystem.Meters;
  const mesh = new r.Mesh();
  for (const z of [bottom, top]) for (const [x, y] of [[-10, -10], [10, -10], [10, 10], [-10, 10]]) mesh.vertices().add(E + x!, N + y!, z);
  for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
    mesh.faces().addTriFace(a, b, c);
    mesh.faces().addTriFace(a, c, d);
  }
  doc.objects().addMesh(mesh, null);
  const parsed = parseMassing3dm(r, doc.toByteArray());
  return { ...parsed, id: "t", name: "tower.3dm", fileBytes: 1, mode: "mga", visible: true, placement: mgaPlacement(parsed) };
}

function model(buildings: BuildingFeat[], terrain: TerrainField): CityModel {
  return {
    placeLabel: "Dandenong", center: origin, sideM, terrain,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings, roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "test",
  } as CityModel;
}

/** Plan shadow length beyond the footprint, along the sun's plan direction (m). */
function shadowLength(m: CityModel, footprint: Pt[]): number {
  const sample = sunAtMelbourneLocal(when.lat, when.lon, when.year, when.month, when.day, when.hour, when.minute);
  const off = planShadowOffset(sample, 1)!;
  const len = Math.hypot(off[0], off[1]);
  const u: Pt = [off[0] / len, off[1] / len];
  const proj = (p: Pt) => p[0] * u[0] + p[1] * u[1];
  clearPlanShadowCache();
  const rings = planShadowRings(m, when, true);
  let far = -Infinity;
  for (const poly of rings) for (const ring of poly) for (const p of ring) far = Math.max(far, proj(p));
  return far - Math.max(...footprint.map(proj));
}

const cotAlt = () => {
  const s = sunAtMelbourneLocal(when.lat, when.lon, when.year, when.month, when.day, when.hour, when.minute);
  return 1 / Math.tan((s.altitudeDeg * Math.PI) / 180);
};

describe("imported massing plan shadows (Dandenong, 22 Jun 11:00 AEST)", () => {
  beforeEach(() => clearPlanShadowCache());

  it("sun is ~25.7° up, so a shadow is ~2.08 × height above ground (3D and 2D)", () => {
    expect(cotAlt()).toBeGreaterThan(2.0);
    expect(cotAlt()).toBeLessThan(2.15);
  });

  const cases = [
    { name: "base 27.26 m AHD on 35 m terrain (model partly sunk)", terrain: 35, bottom: 27.26, top: 47.26 },
    { name: "solid modelled from 0 m AHD to a 30 m AHD roof on 27 m terrain", terrain: 27, bottom: 0, top: 30 },
    { name: "base 27.26 m AHD on 27.26 m terrain (sits on ground)", terrain: 27.26, bottom: 27.26, top: 37.26 },
  ];
  for (const c of cases) {
    it(`imported: 2D shadow matches 3D (top above terrain × cot alt) — ${c.name}`, async () => {
      const item = await importBox([0, 0], c.bottom, c.top);
      const terrain = flatTerrain(c.terrain);
      const groundAt = (e: number, n: number) => sampleTerrain(terrain, e, n, sideM);
      const drawn = massingDrawingBuildings([item], origin, zone, groundAt);
      const ratio2d = shadowLength(model(drawn, terrain), drawn[0]!.ring) / (c.top - c.terrain);
      expect(ratio2d).toBeCloseTo(cotAlt(), 2);
    });
  }

  it("regular buildings were and stay at cot alt (not affected)", () => {
    const ring: Pt[] = [[50, 50], [70, 50], [70, 70], [50, 70], [50, 50]];
    const b: BuildingFeat = { id: 1, ring, holes: [], height: 15, use: "retail", source: "none" };
    const ratio = shadowLength(model([b], flatTerrain(27)), ring) / 15;
    expect(ratio).toBeCloseTo(cotAlt(), 2);
  });
});
