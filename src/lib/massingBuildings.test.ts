import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getColour } from "./colours";
import {
  levelsFromUserText,
  massingBuildingColour,
  useFromLayerPath,
  useFromUserText,
} from "./massingBuildings";
import {
  buildLayeredMassingBytes,
  buildMassingFixtureBytes,
  ringArea,
  THREE_BUILDINGS_FIXTURE,
} from "./massingFixture3dm";
import { massingBuildingFootprint } from "./massingFootprint";
import { looksLocal, mgaPlacement, parseMassing3dm, toImportedMassing, type ParsedMassing } from "./massingImport";
import { importedMassingFromStored, storedBuildingState, type StoredMassing } from "./massingStore";
import { loadRhino } from "./rhinoExport";
import type { Pt } from "../types";

const origin = { lon: 144.98038, lat: -37.81356 };
const zone = 55;
const FIXTURE_PATH = new URL("./__fixtures__/rhino-three-buildings.3dm", import.meta.url);

async function parse(bytes: Uint8Array, name = "scheme.3dm"): Promise<ParsedMassing> {
  return parseMassing3dm(await loadRhino(), bytes, name);
}

function byName(parsed: ParsedMassing, name: string) {
  const building = parsed.buildings.find((entry) => entry.name === name);
  if (!building) throw new Error(`no building ${name}`);
  return building;
}

function digest(view: ArrayBufferView): string {
  return createHash("sha256")
    .update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .digest("hex")
    .slice(0, 16);
}

function expectThreeBuildings(parsed: ParsedMassing) {
  expect(parsed.buildings.map((building) => building.name)).toEqual(["Tower A", "Podium", "Tower B"]);
  expect(parsed.buildings.map((building) => building.scheme)).toEqual(["Scheme A", "Scheme A", "Scheme A"]);
  expect(parsed.buildings.map((building) => building.layerPath)).toEqual([
    "Scheme A::Tower A",
    "Scheme A::Podium",
    "Scheme A::Tower B",
  ]);
  expect(parsed.buildings.map((building) => building.use)).toEqual(["residential", null, "commercial"]);
  expect(parsed.buildings.map((building) => building.levels)).toEqual([null, null, 12]);
  expect(parsed.buildings.map((building) => building.groupedBy)).toEqual(["layer", "layer", "userText"]);
  expect(byName(parsed, "Tower A").height).toBeCloseTo(86, 4);
  expect(byName(parsed, "Podium").height).toBeCloseTo(18, 4);
  expect(byName(parsed, "Tower B").height).toBeCloseTo(62, 4);
  for (const building of parsed.buildings) {
    expect(building.baseZ).toBeCloseTo(0, 4);
    expect(building.height).toBeCloseTo(building.topZ - building.baseZ, 9);
  }
  expect(new Set(parsed.buildings.map((building) => building.id)).size).toBe(3);
  expect(parsed.notes).toContain("3 buildings from layers and user text");
  expect(looksLocal(parsed)).toBe(false);
  expect(parsed.anchor).toEqual({ e: 320_873, n: 5_812_103.5, z: 0 });
}

describe("Rhino import buildings", () => {
  it("reads three buildings from layers and user text in a real .3dm", async () => {
    expectThreeBuildings(await parse(await buildLayeredMassingBytes(THREE_BUILDINGS_FIXTURE)));
  });

  it("reads the committed fixture file Kelvin can open in Rhino", async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
    const parsed = await parse(bytes, "rhino-three-buildings.3dm");
    expectThreeBuildings(parsed);
    const fresh = await parse(await buildLayeredMassingBytes(THREE_BUILDINGS_FIXTURE), "rhino-three-buildings.3dm");
    expect(parsed.buildings).toEqual(fresh.buildings);
    expect(digest(parsed.positions)).toBe(digest(fresh.positions));
    expect(digest(parsed.indices)).toBe(digest(fresh.indices));
  });

  it("gives each building its own triangle range, covering every triangle once", async () => {
    const parsed = await parse(new Uint8Array(readFileSync(FIXTURE_PATH)));
    let next = 0;
    for (const building of parsed.buildings) {
      expect(building.triStart).toBe(next);
      expect(building.triEnd).toBeGreaterThan(building.triStart);
      next = building.triEnd;
    }
    expect(next).toBe(parsed.triangles);
    for (const building of parsed.buildings) {
      for (let t = building.triStart * 3; t < building.triEnd * 3; t++) {
        expect(parsed.indices[t]).toBeGreaterThanOrEqual(building.vertexStart);
        expect(parsed.indices[t]).toBeLessThan(building.vertexEnd);
      }
    }
  });

  it("draws three separate footprints, one per building", async () => {
    const parsed = await parse(new Uint8Array(readFileSync(FIXTURE_PATH)));
    const imported = toImportedMassing(parsed, {
      id: "three",
      name: "rhino-three-buildings.3dm",
      fileBytes: 1,
      mode: "click",
      visible: true,
      placement: { ...mgaPlacement({ anchor: { e: 322_000, n: 5_812_900, z: 10 } }) },
    });
    const footprints = imported.buildings.map((building) =>
      massingBuildingFootprint(imported, building, origin, zone),
    );
    expect(footprints.map((footprint) => footprint.polygons.length)).toEqual([1, 1, 1]);
    expect(footprints.map((footprint) => ringArea(footprint.polygons[0]![0] as Pt[]))).toEqual([
      expect.closeTo(600, 0),
      expect.closeTo(1500, 0),
      expect.closeTo(360, 0),
    ]);
    expect(footprints.map((footprint) => footprint.topZ)).toEqual([
      expect.closeTo(96, 3),
      expect.closeTo(28, 3),
      expect.closeTo(72, 3),
    ]);
  });

  it("keeps the same leaf layer name in two schemes apart", async () => {
    const parsed = await parse(
      await buildLayeredMassingBytes([
        { layer: "Scheme A::Tower B", box: [0, 0, 0, 10, 10, 30] },
        { layer: "Scheme B::Tower B", box: [20, 0, 0, 30, 10, 50] },
      ]),
    );
    expect(parsed.buildings.map((building) => [building.name, building.scheme, building.height])).toEqual([
      ["Tower B", "Scheme A", expect.closeTo(30, 4)],
      ["Tower B", "Scheme B", expect.closeTo(50, 4)],
    ]);
    expect(parsed.buildings[0]!.id).not.toBe(parsed.buildings[1]!.id);
    expect(parsed.notes).toContain("2 buildings from layers");
  });

  it("lets building user text win over the layer, joining objects across layers", async () => {
    const parsed = await parse(
      await buildLayeredMassingBytes([
        { layer: "Site::Retail Podium", userText: { building: "Block C" }, box: [0, 0, 0, 30, 30, 8] },
        { layer: "Site::Tower", userText: { Building: "Block C", USE: "Mixed-Use" }, box: [5, 5, 8, 15, 15, 60] },
        { layer: "Site::Tower", box: [40, 0, 0, 50, 10, 20] },
      ]),
    );
    expect(parsed.buildings.map((building) => building.name)).toEqual(["Block C", "Tower"]);
    const block = byName(parsed, "Block C");
    expect(block.use).toBe("mixed_use");
    expect(block.layerPath).toBe("Site::Retail Podium");
    expect(block.height).toBeCloseTo(60, 4);
    expect(byName(parsed, "Tower").use).toBeNull();
  });

  it("takes use from user text over the layer word, normalising case and spelling", async () => {
    const parsed = await parse(
      await buildLayeredMassingBytes([
        { layer: "Residential", userText: { use: " Mixed Use " }, box: [0, 0, 0, 10, 10, 10] },
      ]),
    );
    expect(parsed.buildings[0]!.use).toBe("mixed_use");
    expect(useFromUserText("MIXED-USE")).toBe("mixed_use");
    expect(useFromUserText("mixed_use")).toBe("mixed_use");
    expect(useFromUserText("Civic")).toBe("civic");
    expect(useFromUserText("office")).toBeNull();
    expect(useFromLayerPath("Industrial Estate::Shed 4")).toBe("industrial");
    expect(useFromLayerPath("Scheme A::Mixed use tower")).toBe("mixed_use");
    expect(useFromLayerPath("Scheme A::Recreational")).toBeNull();
    expect(useFromLayerPath("Scheme A::Podium")).toBeNull();
  });

  it("ignores levels that are not a whole number", async () => {
    const parsed = await parse(
      await buildLayeredMassingBytes([
        { layer: "A", userText: { building: "Words", levels: "twelve" }, box: [0, 0, 0, 10, 10, 10] },
        { layer: "B", userText: { building: "Half", levels: "3.5" }, box: [20, 0, 0, 30, 10, 10] },
        { layer: "C", userText: { building: "Whole", levels: " 7 " }, box: [40, 0, 0, 50, 10, 10] },
      ]),
    );
    expect(parsed.buildings.map((building) => building.levels)).toEqual([null, null, 7]);
    expect(levelsFromUserText("0")).toBeNull();
    expect(levelsFromUserText("-2")).toBeNull();
    expect(levelsFromUserText("1e2")).toBeNull();
  });

  it("keeps a file with no layers or user text as one building, exactly as before", async () => {
    const bytes = await buildMassingFixtureBytes("setback", origin, zone);
    const parsed = await parse(bytes, "setback.3dm");
    expect(parsed.buildings).toHaveLength(1);
    expect(parsed.buildings[0]).toMatchObject({
      id: "file",
      name: "setback",
      layerPath: null,
      scheme: null,
      use: null,
      levels: null,
      groupedBy: "file",
      triStart: 0,
      triEnd: parsed.triangles,
      vertexStart: 0,
      vertexEnd: parsed.positions.length / 3,
    });
    expect(parsed.buildings[0]!.height).toBeCloseTo(36, 4);
    expect(parsed.notes).toEqual(["1 building: no layers or attributes"]);
    expect(digest(parsed.positions)).toBe("cac9eecaad91c17e");
    expect(digest(parsed.indices)).toBe("be821abd7bde17dd");
    expect(parsed.partTriangleStarts).toEqual([0, 14, 28, 42]);
    const gable = await parse(await buildMassingFixtureBytes("gableSingle", origin, zone), "gable.3dm");
    expect(digest(gable.positions)).toBe("b4a26b97316d1ff1");
    expect(digest(gable.indices)).toBe("af7e7a1f291a011f");
  });

  it("puts loose objects on the default layer into a building named after the file", async () => {
    const parsed = await parse(
      await buildLayeredMassingBytes([
        { box: [0, 0, 0, 10, 10, 10] },
        { layer: "Scheme A::Civic Hall", box: [20, 0, 0, 30, 10, 14] },
      ]),
      "Option 2.3dm",
    );
    expect(parsed.buildings.map((building) => [building.name, building.groupedBy, building.use])).toEqual([
      ["Option 2", "file", null],
      ["Civic Hall", "layer", "civic"],
    ]);
  });

  it("reads millimetre files with heights in metres", async () => {
    const parsed = await parse(await buildLayeredMassingBytes(THREE_BUILDINGS_FIXTURE, "Millimeters"));
    expect(parsed.unitScale).toBe(0.001);
    expect(parsed.buildings.map((building) => building.height)).toEqual([
      expect.closeTo(86, 3),
      expect.closeTo(18, 3),
      expect.closeTo(62, 3),
    ]);
  });
});

describe("saved models", () => {
  const legacyRow = (bytes: Uint8Array) =>
    ({
      id: "lp8k2x-abc123",
      cutKey: "-37.81356,144.98038",
      name: "rhino-three-buildings.3dm",
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      mode: "click",
      placement: { e: 322_000, n: 5_812_900, base: 10, rotDeg: 15 },
      visible: true,
      colour: "#3366cc",
      addedAt: "2026-11-01T09:00:00.000Z",
    }) satisfies StoredMassing;

  it("loads a model saved before buildings were read as one visible building", async () => {
    const row = legacyRow(new Uint8Array(readFileSync(FIXTURE_PATH)));
    const parsed = await parse(new Uint8Array(row.bytes), row.name);
    const item = importedMassingFromStored(parsed, row);
    expect(item.buildings).toHaveLength(1);
    expect(item.buildings[0]).toMatchObject({
      id: "file",
      name: "rhino-three-buildings",
      visible: true,
      triStart: 0,
      triEnd: parsed.triangles,
    });
    expect(item.buildings[0]!.height).toBeCloseTo(86, 4);
    expect(item.colour).toBe("#3366CC");
    expect(item.placement).toEqual(row.placement);
    expect(item.notes.some((note) => note.startsWith("3 buildings"))).toBe(false);
    expect(item.notes.some((note) => note.startsWith("1 building: saved before"))).toBe(true);
  });

  it("restores per-building visibility and colour on newer saves", async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE_PATH));
    const parsed = await parse(bytes, "rhino-three-buildings.3dm");
    const imported = toImportedMassing(parsed, {
      id: "x",
      name: "rhino-three-buildings.3dm",
      fileBytes: bytes.byteLength,
      mode: "mga",
      visible: true,
      placement: mgaPlacement(parsed),
    });
    imported.buildings[1] = { ...imported.buildings[1]!, visible: false };
    imported.buildings[2] = { ...imported.buildings[2]!, colour: "#112233" };
    const row = { ...legacyRow(bytes), buildings: storedBuildingState(imported.buildings) };
    const item = importedMassingFromStored(parsed, row);
    expect(item.buildings.map((building) => building.visible)).toEqual([true, false, true]);
    expect(item.buildings.map((building) => building.colour)).toEqual([undefined, undefined, "#112233"]);
    expect(item.notes).toContain("3 buildings from layers and user text");
  });
});

describe("imported building colour", () => {
  it("resolves building colour, then file colour, then use colour, then unclassified grey", () => {
    const residential = { use: "residential" as const };
    const unclassified = { use: null };
    expect(massingBuildingColour({}, residential)).toBe(getColour("--use-residential"));
    expect(massingBuildingColour({}, unclassified)).toBe(getColour("--use-unclassified"));
    expect(massingBuildingColour({ colour: "#AA0000" }, residential)).toBe("#AA0000");
    expect(massingBuildingColour({ colour: "#AA0000" }, unclassified)).toBe("#AA0000");
    expect(massingBuildingColour({ colour: "#AA0000" }, { ...residential, colour: "#00BB00" })).toBe("#00BB00");
    expect(massingBuildingColour({}, { ...unclassified, colour: "#00BB00" })).toBe("#00BB00");
  });
});
