import { describe, expect, it } from "vitest";
import { sitePlanChunks } from "./aiPlan";
import { aggregateHourlyWind } from "./windRose";
import { WIND_CACHE_VERSION } from "./windCache";
import { model } from "./aiExport.test";

describe("wind export layers", () => {
  it("adds Wind only when wind export options are set", () => {
    const table = aggregateHourlyWind(
      -37.82,
      145.1,
      WIND_CACHE_VERSION,
      ["2016-06-01T12:00"],
      [12],
      [180],
    );
    const off = sitePlanChunks(model(), 1000, undefined, { castShadows: false });
    expect(off.map((chunk) => chunk.name)).not.toContain("Wind");
    const on = sitePlanChunks(model(), 1000, undefined, { wind: { table, period: "winter" } });
    expect(on.map((chunk) => chunk.name)).toContain("Wind");
  });
});
