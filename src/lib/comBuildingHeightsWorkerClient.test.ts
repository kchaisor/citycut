import { describe, expect, it, vi } from "vitest";
import { runComBuildingHeightsInWorker } from "./comBuildingHeightsWorkerClient";
import type { BuildingFeat } from "../types";

vi.mock("./comBuildingHeightsMatch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./comBuildingHeightsMatch")>();
  return {
    ...mod,
    applyComBuildingHeights: vi.fn(() => {
      throw new Error("match failed");
    }),
  };
});

const building: BuildingFeat = {
  id: 1,
  ring: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  holes: [],
  height: 9,
  use: "unclassified",
  source: "none",
};

const footprint = {
  id: "a",
  ring: building.ring,
  holes: [] as typeof building.holes,
  height_m: 12,
  minX: 0,
  minY: 0,
  maxX: 10,
  maxY: 10,
};

describe("runComBuildingHeightsInWorker", () => {
  it("rejects when CoM height matching fails instead of returning unchanged buildings", async () => {
    const worker = globalThis.Worker;
    // Vitest provides Worker; force the in-thread fallback so the mock applies.
    // @ts-expect-error test override
    globalThis.Worker = undefined;
    try {
      await expect(runComBuildingHeightsInWorker([building], [footprint])).rejects.toThrow(/Melbourne heights/);
    } finally {
      globalThis.Worker = worker;
    }
  });
});
