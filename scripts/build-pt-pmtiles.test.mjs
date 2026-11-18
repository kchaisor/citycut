import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterGeojson } from "./build-pt-pmtiles.mjs";

const keepMode = (props) => ({ MODE: props.MODE ?? props.mode ?? "" });

const fixture = {
  type: "FeatureCollection",
  name: "public_transport_lines",
  features: [
    {
      type: "Feature",
      properties: { MODE: "METRO TRAIN", SHORT_NAME: "Lilydale", HEADSIGN: "City" },
      geometry: { type: "LineString", coordinates: [[144.9631234567, -37.8136123456], [145.0012345678, -37.82]] },
    },
    {
      type: "Feature",
      properties: { MODE: "REGIONAL TRAIN", SHORT_NAME: "Bendigo" },
      geometry: { type: "LineString", coordinates: [[144.28, -36.76], [144.3, -36.9]] },
    },
    {
      type: "Feature",
      properties: { mode: "METRO BUS", ROUTE: "901" },
      geometry: {
        type: "MultiLineString",
        coordinates: [[[145.5, -38.0], [145.9, -38.1]], [[146.0, -38.2], [146.1, -38.3]]],
      },
    },
    {
      type: "Feature",
      properties: { MODE: "METRO TRAM" },
      geometry: { type: "Point", coordinates: [145.6, -37.8] },
    },
    { type: "Feature", properties: { MODE: "UNKNOWN" }, geometry: null },
    {
      type: "Feature",
      properties: null,
      geometry: { type: "Point", coordinates: [144.95, -37.81] },
    },
  ],
};

describe("filterGeojson", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pt-filter-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("streams metro features with kept props and rounded coordinates", async () => {
    const input = join(dir, "in.geojson");
    const output = join(dir, "out.geojson");
    writeFileSync(input, JSON.stringify(fixture));

    const count = await filterGeojson(input, output, keepMode);

    const expected = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { MODE: "METRO TRAIN" },
          geometry: { type: "LineString", coordinates: [[144.96312, -37.81361], [145.00123, -37.82]] },
        },
        {
          type: "Feature",
          properties: { MODE: "METRO BUS" },
          geometry: {
            type: "MultiLineString",
            coordinates: [[[145.5, -38.0], [145.9, -38.1]], [[146.0, -38.2], [146.1, -38.3]]],
          },
        },
        {
          type: "Feature",
          properties: { MODE: "" },
          geometry: { type: "Point", coordinates: [144.95, -37.81] },
        },
      ],
    };
    expect(count).toBe(3);
    expect(readFileSync(output, "utf8")).toBe(JSON.stringify(expected));
  });

  it("writes an empty FeatureCollection when nothing is in metro", async () => {
    const input = join(dir, "in.geojson");
    const output = join(dir, "out.geojson");
    writeFileSync(input, JSON.stringify({ type: "FeatureCollection", features: [fixture.features[1]] }));

    expect(await filterGeojson(input, output, keepMode)).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({ type: "FeatureCollection", features: [] });
  });
});
