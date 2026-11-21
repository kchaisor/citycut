import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { looksLocal, parseMassing3dm } from "./massingImport";
import { loadRhino } from "./rhinoExport";
import { parsedMassingSnapshot, QA_SCHEME_FILE_NAME, qaSchemeMassing } from "./qaSchemeFixture";
import snapshot from "./__fixtures__/rhino-three-buildings.parsed.json";

const FIXTURE_URL = new URL("./__fixtures__/rhino-three-buildings.3dm", import.meta.url);
const SNAPSHOT_URL = new URL("./__fixtures__/rhino-three-buildings.parsed.json", import.meta.url);

describe("qaMassing=scheme fixture", () => {
  it("matches a fresh parse of the committed .3dm", async () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE_URL));
    const fresh = parsedMassingSnapshot(parseMassing3dm(await loadRhino(), bytes, QA_SCHEME_FILE_NAME), bytes.byteLength);
    if (process.env.UPDATE_QA_SCHEME_SNAPSHOT === "1") writeFileSync(SNAPSHOT_URL, `${JSON.stringify(fresh)}\n`);
    expect(JSON.parse(JSON.stringify(fresh))).toEqual(snapshot);
  });

  it("loads three visible buildings at their own MGA 2020 coordinates", () => {
    const massing = qaSchemeMassing(3);
    expect(massing.buildings.map((building) => building.name)).toEqual(["Tower A", "Podium", "Tower B"]);
    expect(massing.mode).toBe("mga");
    expect(massing.placement).toEqual({ e: 320_873, n: 5_812_103.5, base: 3, rotDeg: 0 });
    expect(looksLocal(massing)).toBe(false);
    expect(massing.buildings.every((building) => building.visible)).toBe(true);
  });
});
