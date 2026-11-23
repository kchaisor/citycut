// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIEW_STORAGE_KEY } from "../lib/viewMemory";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

vi.mock("./Scene3D", () => ({
  Scene3D: ({ projection, exploded, explodeGapM }: { projection: string; exploded?: boolean; explodeGapM?: number }) => (
    <div data-testid="scene-3d" data-projection={projection} data-exploded={String(exploded === true)} data-gap={String(explodeGapM)} />
  ),
}));
vi.mock("./DrawingPlan", () => ({
  DrawingPlan: () => <div data-testid="drawing-plan" />,
}));
vi.mock("./DrawingExplodedAxo", () => ({
  DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" />,
}));
vi.mock("./SatellitePane", () => ({
  SatellitePane: () => <div data-testid="satellite-pane" />,
}));

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function sampleModel(sideM = 500): CityModel {
  return {
    placeLabel: "Fitzroy",
    center: { lon: 144.978, lat: -37.8 },
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: square(-10, -10, 10, 10), holes: [], height: 12, use: "residential", source: "osm_tag" }],
    roads: [{ id: 1, kind: "road", grade: "local", width: 8, line: [[-40, 0], [40, 0]] }],
    areas: [],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "",
  };
}

const scene = () => screen.getByTestId("scene-3d");
const projectionGroup = () => screen.getByRole("group", { name: "3D projection" });
const pill = (name: string) => within(projectionGroup()).getByRole("button", { name });
const pressed = (name: string) => pill(name).getAttribute("aria-pressed");
const gapCard = () => document.querySelector<HTMLElement>('[data-analysis-card="exploded-axo"]');
const gapSlider = () => screen.getByRole("slider", { name: "Layer gap" }) as HTMLInputElement;

function renderModel(model = sampleModel()) {
  return render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
}

describe("Exploded axo in the 3D model view", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("puts the Exploded axo pill after Isometric and before Plan, unpressed on open", () => {
    renderModel();
    expect(within(projectionGroup()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Perspective",
      "Isometric",
      "Exploded axo",
      "Plan",
    ]);
    expect(pressed("Exploded axo")).toBe("false");
    expect(scene().dataset.exploded).toBe("false");
    expect(gapCard()).toBeNull();
  });

  it("explodes on the isometric camera, pressing only the Exploded axo pill", async () => {
    const user = userEvent.setup();
    renderModel();
    await user.click(pill("Exploded axo"));
    expect(scene().dataset.exploded).toBe("true");
    expect(scene().dataset.projection).toBe("iso");
    expect(pressed("Exploded axo")).toBe("true");
    expect(pressed("Perspective")).toBe("false");
    expect(pressed("Isometric")).toBe("false");
    expect(pressed("Plan")).toBe("false");
    expect((screen.getByRole("combobox", { name: "3D projection" }) as HTMLSelectElement).value).toBe("exploded");
  });

  it.each([
    ["Perspective", "perspective"],
    ["Isometric", "iso"],
    ["Plan", "plan"],
  ])("collapses when %s is clicked and shows that view", async (name, projection) => {
    const user = userEvent.setup();
    renderModel();
    await user.click(pill("Exploded axo"));
    await user.click(pill(name));
    expect(scene().dataset.exploded).toBe("false");
    expect(scene().dataset.projection).toBe(projection);
    expect(pressed("Exploded axo")).toBe("false");
    expect(pressed(name)).toBe("true");
    expect(gapCard()).toBeNull();
  });

  it("shows the Layer gap card only while exploded, and the slider sets the gap in metres", async () => {
    const user = userEvent.setup();
    renderModel(sampleModel(500));
    expect(screen.queryByRole("slider", { name: "Layer gap" })).toBeNull();
    await user.click(pill("Exploded axo"));
    const card = gapCard()!;
    expect(card.closest(".right-hud-stack")).not.toBeNull();
    expect(document.querySelector(".bottom-bar [data-analysis-card]")).toBeNull();
    expect(within(card).getByText("Layer gap")).toBeTruthy();
    expect(gapSlider().min).toBe("10");
    expect(gapSlider().max).toBe("300");
    expect(gapSlider().step).toBe("5");
    expect(gapSlider().value).toBe("75");
    expect(card.querySelector("output")!.textContent).toBe("75 m");
    expect(scene().dataset.gap).toBe("75");
    fireEvent.change(gapSlider(), { target: { value: "140" } });
    expect(scene().dataset.gap).toBe("140");
    expect(card.querySelector("output")!.textContent).toBe("140 m");
    expect(scene().dataset.exploded).toBe("true");
  });

  it("sits in the right column alongside the Site Intelligence card and an analysis card", async () => {
    const user = userEvent.setup();
    renderModel();
    await user.click(pill("Exploded axo"));
    await user.click(screen.getByRole("button", { name: "Solar Study" }));
    const stack = document.querySelector(".right-hud-stack")!;
    expect(stack.querySelector(".right-inspector")).not.toBeNull();
    expect([...stack.querySelectorAll("[data-analysis-card]")].map((el) => el.getAttribute("data-analysis-card"))).toEqual([
      "exploded-axo",
      "solar",
    ]);
    expect(scene().dataset.exploded).toBe("true");
  });

  it("leaves the Drawing tab's own Exploded axo pill alone and hides the gap card off the 3D tab", async () => {
    const user = userEvent.setup();
    renderModel();
    await user.click(pill("Exploded axo"));
    await user.click(screen.getByRole("tab", { name: "Drawing" }));
    expect(screen.queryByRole("group", { name: "3D projection" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quick Exploded axo" }).getAttribute("aria-pressed")).toBe("false");
    expect(gapCard()).toBeNull();
  });

  it("does not save exploded: the stored view is plain isometric and a new cut opens assembled", async () => {
    const user = userEvent.setup();
    const view = renderModel(sampleModel(500));
    await user.click(pill("Exploded axo"));
    fireEvent.change(gapSlider(), { target: { value: "200" } });
    expect(JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY)!)).toEqual({ projection: "iso", corner: "sw", freeRotate: false });
    view.rerender(<ModelPage model={sampleModel(1000)} onHome={vi.fn()} onNewCut={vi.fn()} />);
    expect(scene().dataset.exploded).toBe("false");
    expect(gapCard()).toBeNull();
    await user.click(pill("Exploded axo"));
    expect(gapSlider().value).toBe("150");
    expect(gapSlider().max).toBe("600");
  });
});
