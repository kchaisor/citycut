import { describe, expect, it, vi } from "vitest";
import type { SunStudyWorkerMessage } from "./sunStudyShadows.worker";
import type { BuildingFeat } from "../types";

function box(id: number, east: number, north: number, size: number, height: number): BuildingFeat {
  const h = size / 2;
  return {
    id,
    ring: [
      [east - h, north - h],
      [east + h, north - h],
      [east + h, north + h],
      [east - h, north + h],
      [east - h, north - h],
    ],
    holes: [],
    height,
    use: "unclassified",
    source: "none",
  };
}

describe("sun study shadow worker", () => {
  it("posts one shadow layer per requested hour", async () => {
    const posted: SunStudyWorkerMessage[] = [];
    const scope: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: SunStudyWorkerMessage) => void } = {
      onmessage: null,
      postMessage: (m) => posted.push(m),
    };
    vi.stubGlobal("self", scope);
    await import("./sunStudyShadows.worker");
    scope.onmessage!({
      data: {
        id: 7,
        model: { sideM: 400, terrain: null, buildings: [box(1, 0, 0, 20, 30)] },
        date: { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 },
        hours: [9, 12, 15],
      },
    } as MessageEvent);
    vi.unstubAllGlobals();
    expect(posted.map((m) => [m.type, m.id, m.hour])).toEqual([
      ["hour", 7, 9],
      ["hour", 7, 12],
      ["hour", 7, 15],
    ]);
    for (const m of posted) if (m.type === "hour") expect(m.rings.length).toBeGreaterThan(0);
    // morning shadow falls west of the building, afternoon shadow east
    const xs = (m: SunStudyWorkerMessage) => (m.type === "hour" ? m.rings.flat(2).map((p) => p[0]) : []);
    expect(Math.min(...xs(posted[0]!))).toBeLessThan(-15);
    expect(Math.max(...xs(posted[2]!))).toBeGreaterThan(15);
  });
});
