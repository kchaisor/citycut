import { describe, expect, it } from "vitest";
import { fetchOvertureTransportationForCut } from "./overtureTransportation";
import { squareBBox } from "./geo";
import { fetchNswLayers } from "./nswLayers";
import { groundRoadPartition } from "./groundRoads";
import { unionCarriageways, carriagewaysOf } from "./roadFill";

const center = { lon: 151.18147, lat: -33.86727 };
const sideM = 1300;
const shape = "square" as const;

describe("Sydney harbour road partition", () => {
  it(
    "partitions NSW corridors with Overture roads without throwing",
    async () => {
      const bounds = squareBBox(center, sideM);
      const signal = new AbortController().signal;
      const [transport, nsw] = await Promise.all([
        fetchOvertureTransportationForCut(bounds, center, sideM, signal, shape),
        fetchNswLayers(center, sideM, { signal, frameShape: shape }),
      ]);
      const model = {
        sideM,
        frameShape: shape,
        roads: transport.roads,
        nsw,
      };
      const partition = groundRoadPartition(model);
      const area =
        partition.roads.arterial.length +
        partition.roads.local.length +
        partition.roads.path.length +
        partition.remaining.length;
      expect(area).toBeGreaterThan(0);
      const arterialOverture = unionCarriageways(
        carriagewaysOf(transport.roads.filter((r) => r.grade === "arterial")),
        sideM,
        shape,
      ).polygons;
      expect(arterialOverture.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
