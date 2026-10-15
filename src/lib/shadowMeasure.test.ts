import { describe, expect, it } from "vitest";
import rhino3dm from "rhino3dm";
import { parseMassing3dm, mgaPlacement, placedLocal, type ImportedMassing } from "./massingImport";
import { massingDrawingBuildings } from "./massingFootprint";
import { clearPlanShadowCache, planShadowOffset, planShadowRings } from "./buildingShadows";
import { footprintBase, sampleTerrain } from "./terrain";
import { sunAtMelbourneLocal } from "./solar";
import { projectLocal } from "./crs";
import realTerrain from "./__fixtures__/dandenongTerrain.json";
import type { BuildingFeat, CityModel, Pt, TerrainField } from "../types";

/** Dandenong Market, Winter 22 Jun preset, 11:00 AEST; real MGA 2020 zone 55 projection. */
const origin = { lon: 145.21555, lat: -37.98382 };
const zone = 55;
const when = { lat: origin.lat, lon: origin.lon, year: 2026, month: 6, day: 22, hour: 11, minute: 0 };
const sideM = 1150;
const sample = sunAtMelbourneLocal(when.lat, when.lon, when.year, when.month, when.day, when.hour, when.minute);
const cot = 1 / Math.tan((sample.altitudeDeg * Math.PI) / 180);
const unit = (() => { const o = planShadowOffset(sample, 1)!; const l = Math.hypot(o[0], o[1]); return [o[0] / l, o[1] / l] as Pt; })();
const along = (e: number, n: number) => e * unit[0] + n * unit[1];

/** Real Dandenong terrain (21–49 m AHD), downsampled from the live Mapterhorn fetch. */
const terrain: TerrainField = { ...(realTerrain as Omit<TerrainField, "heights">), heights: new Float32Array(realTerrain.heights) };
const ground = (e: number, n: number) => sampleTerrain(terrain, e, n, sideM);

/** Where a ray from (e,n,z) away from the sun meets the terrain (the 3D shadow tip). */
function tip3d(e: number, n: number, z: number): Pt {
  let lo = 0, hi = 2000;
  for (let i = 0; i < 80; i++) {
    const t = (lo + hi) / 2; // t = plan distance
    const pe = e + unit[0] * t, pn = n + unit[1] * t;
    if (z - t / cot > ground(pe, pn)) lo = t; else hi = t;
  }
  return [e + unit[0] * lo, n + unit[1] * lo];
}

/** A .3dm in MGA with boxes [cx, cy, size, bottom AHD, top AHD] (local metres for the centre). */
async function importFile(boxes: [number, number, number, number, number][]): Promise<ImportedMassing> {
  const r = await (rhino3dm as unknown as () => Promise<any>)();
  const doc = new r.File3dm();
  doc.settings().modelUnitSystem = r.UnitSystem.Meters;
  for (const [cx, cy, s, bottom, top] of boxes) {
    const [E, N] = projectLocal([cx, cy], origin, zone);
    const mesh = new r.Mesh();
    const h = s / 2;
    for (const z of [bottom, top]) for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) mesh.vertices().add(E + x!, N + y!, z);
    for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      mesh.faces().addTriFace(a, b, c);
      mesh.faces().addTriFace(a, c, d);
    }
    doc.objects().addMesh(mesh, null);
  }
  const parsed = parseMassing3dm(r, doc.toByteArray());
  return { ...parsed, id: "k", name: "kelvin.3dm", fileBytes: 1, mode: "mga", visible: true, placement: mgaPlacement(parsed) };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Dandenong", center: origin, sideM, terrain,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings, roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "test",
  } as CityModel;
}

/** Furthest 2D shadow reach (along the sun) for one building drawn alone. */
function reach2d(b: BuildingFeat): number {
  clearPlanShadowCache();
  let far = -Infinity;
  for (const poly of planShadowRings(model([b]), when, true)) for (const ring of poly) for (const [e, n] of ring) far = Math.max(far, along(e, n));
  return far;
}

/** Furthest 3D shadow reach: every top vertex ray-cast onto the terrain. */
function reach3d(points: [number, number, number][]): number {
  let far = -Infinity;
  for (const [e, n, z] of points) { const [te, tn] = tip3d(e, n, z); far = Math.max(far, along(te, tn)); }
  return far;
}

describe("2D plan shadows land where the 3D shadows do, in metres (real Dandenong terrain, MGA 2020 projection)", () => {
  it("imported .3dm with a tall and a low part: each part's 2D shadow ends where 3D does", async () => {
    // Tall block 20 m above ground, low pavilion 4 m above ground, in ONE file.
    const g1 = ground(-40, 0), g2 = ground(40, 0);
    const item = await importFile([[-40, 0, 20, g1 - 2, g1 + 20], [40, 0, 20, g2 - 2, g2 + 4]]);
    const drawn = massingDrawingBuildings([item], origin, zone, ground);
    expect(drawn).toHaveLength(2);
    const local = placedLocal(item, item.placement, origin, zone);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < local.length; i += 3) pts.push([local[i]!, local[i + 1]!, local[i + 2]!]);
    for (const b of drawn) {
      const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length;
      const mine = pts.filter(([e]) => Math.sign(e) === Math.sign(cx));
      const d3 = reach3d(mine), d2 = reach2d(b);

      expect.soft(Math.abs(d2 - d3)).toBeLessThan(1.5);
    }
  });

  it.each([[60, -60], [-200, 150], [250, 200], [-300, -250], [0, 0], [150, -300]])("regular building on the slope at %i,%i", (x0, y0) => {
    const ring: Pt[] = [[x0, y0], [x0 + 30, y0], [x0 + 30, y0 + 30], [x0, y0 + 30], [x0, y0]];
    const b: BuildingFeat = { id: 1, ring, holes: [], height: 15, use: "retail", source: "none" };
    const base = footprintBase(terrain, ring, sideM);
    const d3 = reach3d(ring.map(([e, n]) => [e, n, base + 15]));
    const d2 = reach2d(b);

    expect(Math.abs(d2 - d3)).toBeLessThan(1.5);
  });
});
