// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DrawingPlan } from "./DrawingPlan";
import type { SolarParkAssessResult } from "../lib/solarParkAssess";
import type { CityModel, Ring } from "../types";

const parkRing: Ring = [[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]];

const model = {
  sideM: 200,
  center: { lat: -37.8046, lon: 144.9713 },
  buildings: [],
  roads: [],
  areas: [],
  trees: [],
  terrain: null,
} as unknown as CityModel;

function parkRow(addedShadowRings: Ring[][]): SolarParkAssessResult {
  return {
    assessKind: "park",
    id: "carlton-gardens-park",
    ruleId: "melbourne-c415-ddo8",
    ruleLabel: "C415",
    statusNote: "",
    areaM2: 1200,
    stepAddedM2: [{ hour: 12, minute: 0, addedM2: 96 }],
    totalAddedM2: 96,
    maxAddedM2: 96,
    addedShadowRings,
    pass: false,
    statusLabel: "Fails",
    statusTone: "fail",
    toleranceM2: 0.5,
  };
}

afterEach(cleanup);

describe("park added-shadow hatch", () => {
  it("draws the assess hatch rings even when the plan model has no proposed massing", () => {
    const hatch: Ring[][] = [[[[10, 10], [30, 10], [30, 20], [10, 20], [10, 10]]]];
    const { container } = render(
      <DrawingPlan
        model={model}
        solarReceptors={[{ id: "carlton-gardens-park", kind: "park", ruleId: "melbourne-c415-ddo8", ring: parkRing }]}
        solarReceptorResults={[parkRow(hatch)]}
      />,
    );
    const group = container.querySelector("[data-solar-park-added-shadow='carlton-gardens-park']");
    expect(group).not.toBeNull();
    const paths = [...group!.querySelectorAll("path")];
    expect(paths).toHaveLength(1);
    expect(paths[0]!.getAttribute("fill")).toBe("url(#sun-study-added-hatch)");
    expect((paths[0]!.getAttribute("d") ?? "").length).toBeGreaterThan(20);
  });

  it("draws no hatch when the assess found no added shadow", () => {
    const { container } = render(
      <DrawingPlan
        model={model}
        solarReceptors={[{ id: "carlton-gardens-park", kind: "park", ruleId: "melbourne-c415-ddo8", ring: parkRing }]}
        solarReceptorResults={[parkRow([])]}
      />,
    );
    expect(container.querySelector("[data-solar-park-added-shadow]")).toBeNull();
  });
});
