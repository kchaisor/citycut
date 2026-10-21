// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DrawingPlan } from "./DrawingPlan";
import { getColour } from "../lib/colours";
import { sunStudyMutedOn } from "../lib/sunStudyPlan";
import type { BuildingFeat, CityModel } from "../types";

const box = (id: number, e: number, n: number, h: number, site = false): BuildingFeat =>
  ({
    id,
    ring: [[e - 5, n - 5], [e + 5, n - 5], [e + 5, n + 5], [e - 5, n + 5], [e - 5, n - 5]],
    holes: [],
    height: h,
    use: "unclassified",
    source: "none",
    ...(site ? { site: true } : {}),
  }) as BuildingFeat;

const model = {
  sideM: 200,
  center: { lat: -37.8045, lon: 145.0215 },
  buildings: [box(1, 0, 0, 20), box(2, 40, 20, 8)],
  roads: [],
  areas: [
    { id: 1, kind: "green", holes: [], ring: [[-90, -90], [-60, -90], [-60, -60], [-90, -60], [-90, -90]] },
  ],
  trees: [{ id: 1, at: [50, -50], crown_diameter_m: 6, height_m: 8, trunk_diameter_m: 0.3, sizeSource: "default" }],
  terrain: null,
} as unknown as CityModel;
const date = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22 };

function fills(sunStudyMuted: boolean, sunStudy: typeof date | null = date) {
  const { container } = render(<DrawingPlan model={model} sunStudy={sunStudy} sunStudyMuted={sunStudyMuted} />);
  const all = (sel: string) => [...container.querySelectorAll(sel)].map((el) => (el.getAttribute("fill") ?? "").toLowerCase());
  const circles = [...container.querySelectorAll("svg.plan > circle")];
  const out = {
    paths: all("svg.plan > path"),
    trees: circles.map((c) => `${c.getAttribute("fill")?.toLowerCase()}@${c.getAttribute("fill-opacity")}`),
  };
  cleanup();
  return out;
}

afterEach(cleanup);

describe("sun study muted base plan", () => {
  it("is on by default with the sun study and off only when turned off", () => {
    expect(sunStudyMutedOn(true, undefined)).toBe(true);
    expect(sunStudyMutedOn(true, false)).toBe(false);
    expect(sunStudyMutedOn(false, true)).toBe(false);
    expect(sunStudyMutedOn(undefined, undefined)).toBe(false);
  });

  it("draws buildings, green space and trees in the --sun-study-* tokens", () => {
    const muted = fills(true);
    expect(muted.paths).toContain(getColour("--sun-study-building").toLowerCase());
    expect(muted.paths).toContain(getColour("--sun-study-green").toLowerCase());
    expect(muted.trees).toEqual([`${getColour("--sun-study-tree").toLowerCase()}@0.5`]);
    expect(getColour("--sun-study-tree").toLowerCase()).toBe("#b8e0b0");
  });

  it("toggling back restores the normal fills", () => {
    const normal = fills(false);
    const noStudy = fills(true, null);
    expect(normal).toEqual(noStudy);
    expect(normal.paths).not.toContain(getColour("--sun-study-green").toLowerCase());
    expect(normal.trees[0]).not.toContain(getColour("--sun-study-tree").toLowerCase());
  });
});
