import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { hashMultiPolygon } from "./geometryHash";
import {
  carriagewaysOf,
  clearFootpathUnionCacheForTests,
  unionCarriageways,
  unionPathRoads,
} from "./roadFill";

/** Locked to main union output on east-melbourne-path-trim (legacy strip union). */
const EAST_CARRIAGEWAY_HASH = "7f20aee6";
const EAST_PATH_HASH = "b565025b";

describe("export road geometry parity with main", () => {
  it("unionCarriageways and unionPathRoads match main hashes on east melbourne trim", () => {
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    clearFootpathUnionCacheForTests();
    const car = unionCarriageways(carriagewaysOf(model.roads), model.sideM, model.frameShape ?? "square");
    const paths = model.roads
      .filter((r) => r.grade === "path")
      .map((r) => ({ line: r.line, width: r.width }));
    const pathUnion = unionPathRoads(paths, model.sideM, model.frameShape ?? "square");
    expect(hashMultiPolygon(car.polygons)).toBe(EAST_CARRIAGEWAY_HASH);
    expect(hashMultiPolygon(pathUnion.polygons)).toBe(EAST_PATH_HASH);
  });
});
