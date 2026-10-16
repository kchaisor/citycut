import { describe, expect, it } from "vitest";
import rhino3dm from "rhino3dm";
import { parseMassing3dm, mgaPlacement, type ImportedMassing } from "./massingImport";
import { massingDrawingBuildings } from "./massingFootprint";
import { clearPlanShadowCache, planShadowRings } from "./buildingShadows";
import { sampleTerrain } from "./terrain";
import { SHADOW_STANDARDS, type ShadowStandardId } from "./solar";
import { projectLocal } from "./crs";
import fixture from "./__fixtures__/dandenongShadowFailures.json";
import type { BuildingFeat, CityModel, Pt, Ring, TerrainField } from "../types";

/**
 * Live Dandenong cut: two real footprints whose terrain-draped shadows made polygon-clipping throw
 * at ResCode 10:00 and 15:00, which blanked every 2D shadow. Driven through every preset step the
 * way SunStudyPlayer sets the time (hour, minute 0).
 */
const origin = fixture.center;
const sideM = fixture.sideM;
const terrain: TerrainField = { ...(fixture.terrain as Omit<TerrainField, "heights">), heights: new Float32Array(fixture.terrain.heights) };
const regular = fixture.buildings as unknown as BuildingFeat[];

/** /workspace/shadow-fix/two-part-base27m.3dm: 20 m and 4 m boxes in one MGA file, base 27.26 m AHD. */
async function twoPart(): Promise<ImportedMassing> {
  const r = await (rhino3dm as unknown as () => Promise<any>)();
  const doc = new r.File3dm();
  doc.settings().modelUnitSystem = r.UnitSystem.Meters;
  for (const [dx, dy, s, top] of [[-60, -110, 20, 47.26], [-15, -140, 24, 31.26]] as const) {
    const [E, N] = projectLocal([dx, dy], origin, 55);
    const mesh = new r.Mesh();
    const h = s / 2;
    for (const z of [27.26, top]) for (const [x, y] of [[-h, -h], [h, -h], [h, h], [-h, h]]) mesh.vertices().add(E + x!, N + y!, z);
    for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      mesh.faces().addTriFace(a, b, c);
      mesh.faces().addTriFace(a, c, d);
    }
    doc.objects().addMesh(mesh, null);
  }
  const parsed = parseMassing3dm(r, doc.toByteArray());
  return { ...parsed, id: "two", name: "two-part-base27m.3dm", fileBytes: 1, mode: "mga", visible: true, placement: mgaPlacement(parsed) };
}

function model(buildings: BuildingFeat[]): CityModel {
  return {
    placeLabel: "Dandenong", center: origin, sideM, terrain,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
    buildings, roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "test",
  } as CityModel;
}

function inRings(p: Pt, multi: Ring[][]): boolean {
  for (const rings of multi) {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

const centroid = (ring: Ring): Pt => {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
};

describe("2D shadows at every preset step (real Dandenong footprints and terrain)", async () => {
  const item = await twoPart();
  const imported = massingDrawingBuildings([item], origin, 55, (e, n) => sampleTerrain(terrain, e, n, sideM));
  const all = [...regular, ...imported];
  for (const id of Object.keys(SHADOW_STANDARDS) as ShadowStandardId[]) {
    const preset = SHADOW_STANDARDS[id];
    // Every preset step, plus the rest of 9am–3pm on the same date.
    for (const hour of [...new Set([...preset.hours, 9, 10, 11, 12, 13, 14, 15])].sort((a, b) => a - b)) {
      it(`${id} ${hour}:00${preset.hours.includes(hour) ? " (step)" : ""} — every regular and imported building casts a shadow`, () => {
        clearPlanShadowCache();
        const rings = planShadowRings(model(all), { lat: origin.lat, lon: origin.lon, year: 2026, month: preset.month, day: preset.day, hour, minute: 0 }, true);
        expect(rings.length).toBeGreaterThan(0);
        for (const b of all) expect(inRings(centroid(b.ring), rings), `building ${b.id}`).toBe(true);
      });
    }
  }
});
