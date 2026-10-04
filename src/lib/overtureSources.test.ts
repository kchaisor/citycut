import { describe, expect, it } from "vitest";
import { parseOvertureSources, pickTallestOvertureProps } from "./overtureSources";

describe("parseOvertureSources", () => {
  it("reads OSM way ids from record_id and ignores raw numeric ids", () => {
    const raw = JSON.stringify([
      { provider: "osm", record_id: "w13307317@1" },
      { provider: "OpenStreetMap", record_id: "13307317" },
    ]);
    expect(parseOvertureSources(raw)).toEqual({ microsoft: false, osmWayIds: [13307317] });
  });

  it("flags Microsoft ML sources", () => {
    const raw = JSON.stringify([{ provider: "Microsoft", dataset: "Global ML Building Footprints" }]);
    expect(parseOvertureSources(raw).microsoft).toBe(true);
  });
});

describe("pickTallestOvertureProps", () => {
  it("keeps props from the fragment with the greatest extrusion height", () => {
    const props = pickTallestOvertureProps([
      { props: { height: 12 } },
      { props: { height: 250, num_floors: 3 } },
      { props: { height: 40 } },
    ]);
    expect(props.height).toBe(250);
  });
});
