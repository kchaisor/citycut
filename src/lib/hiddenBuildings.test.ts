import { describe, expect, it } from "vitest";
import { cityModelTo3dm, loadRhino } from "./rhinoExport";
import {
  filterHiddenBuildings,
  hideBuildings,
  matchHiddenBuildings,
  parseStoredHiddenBuildings,
  readStoredHiddenBuildings,
  showAllInCut,
  showHiddenEntry,
  writeStoredHiddenBuildings,
  emptyHiddenStore,
} from "./hiddenBuildings";
import type { BuildingFeat, CityModel, Pt } from "../types";

const origin = { lon: 144.98038, lat: -37.81356 };

function square(center: Pt, size: number): Pt[] {
  const h = size / 2;
  return [
    [center[0] - h, center[1] - h],
    [center[0] + h, center[1] - h],
    [center[0] + h, center[1] + h],
    [center[0] - h, center[1] + h],
    [center[0] - h, center[1] - h],
  ];
}

const pullman: BuildingFeat = {
  id: 1,
  ring: square([0, 0], 40),
  holes: [],
  height: 73.1,
  use: "residential",
  source: "none",
  overtureName: "Pullman On The Park",
};
const other: BuildingFeat = { id: 2, ring: square([60, 0], 16), holes: [], height: 10, use: "civic", source: "zone" };
const third: BuildingFeat = { id: 3, ring: square([-60, 30], 20), holes: [], height: 18, use: "commercial", source: "zone" };

const model: CityModel = {
  placeLabel: "East Melbourne",
  center: origin,
  sideM: 200,
  layers: { buildings: true, roads: false, waterGreen: false, trees: false },
  buildings: [pullman, other, third],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "test",
};

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

async function geometryDump(bytes: Uint8Array): Promise<string[]> {
  const rhino = await loadRhino();
  const doc = rhino.File3dm.fromByteArray(bytes);
  try {
    const out: string[] = [];
    for (let i = 0; i < doc.objects().count; i++) {
      const object = doc.objects().get(i);
      const layer = doc.layers().get(object.attributes().layerIndex);
      out.push(`${layer.fullPath}|${object.attributes().name}|${JSON.stringify(object.geometry().encode())}`);
    }
    return out;
  } finally {
    doc.destroy();
  }
}

async function buildingMeshCount(bytes: Uint8Array): Promise<number> {
  const rhino = await loadRhino();
  const doc = rhino.File3dm.fromByteArray(bytes);
  try {
    let count = 0;
    for (let i = 0; i < doc.objects().count; i++) {
      const layer = doc.layers().get(doc.objects().get(i).attributes().layerIndex);
      if (/building/i.test(layer.fullPath)) count++;
    }
    return count;
  } finally {
    doc.destroy();
  }
}

describe("hidden buildings", () => {
  it("returns the same array when nothing is hidden (exports stay byte-identical)", async () => {
    const same = filterHiddenBuildings(model.buildings, new Set());
    expect(same).toBe(model.buildings);
    const ids = new Set(matchHiddenBuildings(model.buildings, emptyHiddenStore(), origin).keys());
    expect(filterHiddenBuildings(model.buildings, ids)).toBe(model.buildings);
    const a = await cityModelTo3dm(model, { hideTrees: false });
    const b = await cityModelTo3dm({ ...model, buildings: same }, { hideTrees: false });
    // rhino3dm stamps fresh object GUIDs and a write time per file, so compare everything else.
    expect(await geometryDump(b)).toEqual(await geometryDump(a));
  });

  it("hides a multi-selection, persists it, and matches it back after reload", () => {
    const store = hideBuildings(emptyHiddenStore(), [pullman, third], origin, "2026-10-13T00:00:00Z");
    expect(store.hidden).toHaveLength(2);
    expect(store.hidden[0]!.label).toBe("Pullman On The Park");
    const storage = memoryStorage();
    writeStoredHiddenBuildings(storage, store);
    const reloaded = readStoredHiddenBuildings(storage);
    const renumbered = model.buildings.map((b) => ({ ...b, id: b.id + 100 }));
    const matched = matchHiddenBuildings(renumbered, reloaded, origin);
    expect([...matched.keys()].sort()).toEqual([101, 103]);
    expect(filterHiddenBuildings(renumbered, new Set(matched.keys())).map((b) => b.id)).toEqual([102]);
  });

  it("does not match in another cut, and Show all clears only this cut", () => {
    const store = hideBuildings(emptyHiddenStore(), [pullman], origin);
    const elsewhere = { lon: 145.0122, lat: -37.8402 };
    expect(matchHiddenBuildings(model.buildings, store, elsewhere).size).toBe(0);
    const both = hideBuildings(store, [{ ...other, ring: square([500, 500], 16) }], origin);
    const matched = matchHiddenBuildings(model.buildings, both, origin);
    expect(matched.size).toBe(1);
    expect(showAllInCut(both, matched.values()).hidden).toHaveLength(1);
    expect(showHiddenEntry(both, [...matched.values()][0]!).hidden).toHaveLength(1);
  });

  it("does not hide the same building twice and ignores corrupt storage", () => {
    const once = hideBuildings(emptyHiddenStore(), [pullman], origin);
    expect(hideBuildings(once, [pullman], origin).hidden).toHaveLength(1);
    expect(parseStoredHiddenBuildings("{bad").hidden).toEqual([]);
    expect(parseStoredHiddenBuildings(JSON.stringify({ v: 9, hidden: [] })).hidden).toEqual([]);
  });

  it("hidden buildings drop out of the .3dm", async () => {
    const hidden = hideBuildings(emptyHiddenStore(), [pullman], origin);
    const ids = new Set(matchHiddenBuildings(model.buildings, hidden, origin).keys());
    const visible = { ...model, buildings: filterHiddenBuildings(model.buildings, ids) };
    const all = await buildingMeshCount(await cityModelTo3dm(model, { uniformBuildings: false }));
    const fewer = await buildingMeshCount(await cityModelTo3dm(visible, { uniformBuildings: false }));
    expect(fewer).toBeLessThan(all);
    expect(visible.buildings.map((b) => b.id)).toEqual([2, 3]);
  });
});
