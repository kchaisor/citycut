// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPage } from "./ModelPage";
import type { CityModel, Pt } from "../types";

const probe = vi.hoisted(() => ({ solar: null as Record<string, unknown> | null, plan: null as { mode: string; vectorsOn: boolean } | null }));

vi.mock("./Scene3D", () => ({
  Scene3D: ({ solar, exploded, explodeGapM }: { solar?: Record<string, unknown>; exploded?: boolean; explodeGapM?: number }) => {
    probe.solar = solar ?? null;
    return <div data-testid="scene-3d" data-exploded={String(exploded === true)} data-explode-gap={String(explodeGapM)} />;
  },
}));
vi.mock("./useWindPlan", async (original) => {
  const actual = await original<typeof import("./useWindPlan")>();
  return {
    ...actual,
    useWindPlan: (args: Parameters<typeof actual.useWindPlan>[0]) => {
      const plan = actual.useWindPlan(args);
      probe.plan = { mode: plan.mode, vectorsOn: plan.vectorsOn };
      return plan;
    },
  };
});
vi.mock("./DrawingPlan", () => ({ DrawingPlan: () => <div data-testid="drawing-plan" /> }));
vi.mock("./DrawingExplodedAxo", () => ({ DrawingExplodedAxo: () => <div data-testid="drawing-exploded-axo" /> }));
vi.mock("./SatellitePane", () => ({ SatellitePane: () => <div data-testid="satellite-pane" /> }));

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function sampleModel(): CityModel {
  return {
    placeLabel: "Toorak",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 1000,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [{ id: 1, ring: square(-10, -10, 10, 10), holes: [], height: 12, use: "residential", source: "osm_tag" }],
    roads: [
      {
        id: 1,
        kind: "road",
        grade: "local",
        width: 8,
        line: [
          [-40, 0],
          [40, 0],
        ],
      },
    ],
    areas: [{ id: 1, kind: "green", ring: square(-30, -30, -15, -15), holes: [] }],
    trees: [],
    roadKm: 0.1,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("Named views in ModelPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the Views panel from the left rail, saves a named view, and lists it again after a reload", async () => {
    const user = userEvent.setup();
    const model = sampleModel();
    const first = render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    await user.click(within(leftRail).getByRole("button", { name: "Views" }));
    expect(within(leftRail).getByRole("button", { name: "Views" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(leftRail).getByRole("button", { name: "Display" }).getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-named-views-count]")?.getAttribute("data-named-views-count")).toBe("0");
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Corner view");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: /^Corner view/ })).toBeTruthy();
    expect(document.querySelector("[data-named-views-count]")?.getAttribute("data-named-views-count")).toBe("1");
    first.unmount();

    render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Corner view/, hidden: true })).toBeTruthy();
  });

  it("restores sun hours settings and the wind plan heatmap mode from a saved view", async () => {
    const user = userEvent.setup();
    const model = sampleModel();
    const first = render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const leftRail = screen.getByRole("toolbar", { name: "Model tools" });
    await user.click(within(leftRail).getByRole("button", { name: "Views" }));
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Study");
    await user.click(screen.getByRole("button", { name: "Save" }));
    first.unmount();

    const store = JSON.parse(window.localStorage.getItem("citycut.namedViews.v1")!) as {
      byCut: Record<string, Array<{ snapshot: Record<string, unknown> }>>;
    };
    const entry = Object.values(store.byCut)[0]![0]!;
    entry.snapshot = {
      ...entry.snapshot,
      tab: "3d",
      view: { projection: "plan", corner: "ne", freeRotate: false },
      analyses: { solar: true, wind: true, view: false },
      solar: {
        ...(entry.snapshot.solar as object),
        sunHours: true,
        sunHoursWindow: "9to3",
        sunHoursPickedOnly: true,
        showPath: true,
        castShadows: true,
        year: 2026,
        month: 12,
        day: 21,
      },
      renderQuality: "fast",
      windPlan: { mode: "comfort", vectorsOn: false, sector: null },
    };
    window.localStorage.setItem("citycut.namedViews.v1", JSON.stringify(store));

    render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    await user.click(within(screen.getByRole("toolbar", { name: "Model tools" })).getByRole("button", { name: "Views" }));
    expect(probe.plan).toMatchObject({ mode: "speed", vectorsOn: true });
    await user.click(screen.getByRole("button", { name: /^Study/ }));
    expect(probe.plan).toMatchObject({ mode: "comfort", vectorsOn: false });
    expect(probe.solar).toMatchObject({
      sunHours: true,
      sunHoursWindow: "9to3",
      sunHoursPickedOnly: true,
      showPath: true,
      castShadows: true,
      month: 12,
      day: 21,
    });
  });

  it("saves the exploded axo with its gap, restores it, and collapses when a view saved assembled is applied", async () => {
    const user = userEvent.setup();
    render(<ModelPage model={sampleModel()} onHome={vi.fn()} onNewCut={vi.fn()} />);
    const projection = () => screen.getByRole("group", { name: "3D projection" });
    const scene = () => screen.getByTestId("scene-3d");
    await user.click(within(projection()).getByRole("button", { name: "Exploded axo" }));
    fireEvent.change(screen.getByRole("slider", { name: "Layer gap" }), { target: { value: "120" } });
    expect(scene().getAttribute("data-explode-gap")).toBe("120");
    await user.click(within(screen.getByRole("toolbar", { name: "Model tools" })).getByRole("button", { name: "Views" }));
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Stack");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saved = JSON.parse(window.localStorage.getItem("citycut.namedViews.v1")!) as {
      byCut: Record<string, { snapshot: { exploded: boolean; explodeGapM: number } }[]>;
    };
    const [stack] = Object.values(saved.byCut)[0]!;
    expect(stack!.snapshot.exploded).toBe(true);
    expect(stack!.snapshot.explodeGapM).toBe(120);

    await user.click(within(projection()).getByRole("button", { name: "Isometric" }));
    expect(scene().dataset.exploded).toBe("false");
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Flat");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: /^Stack/ }));
    expect(scene().dataset.exploded).toBe("true");
    expect(scene().getAttribute("data-explode-gap")).toBe("120");
    expect(within(projection()).getByRole("button", { name: "Exploded axo" }).getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: /^Flat/ }));
    expect(scene().dataset.exploded).toBe("false");
    expect(within(projection()).getByRole("button", { name: "Isometric" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clamps a saved gap to the cut's range and opens views saved before exploded existed assembled", async () => {
    const user = userEvent.setup();
    const model = sampleModel();
    const first = render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    await user.click(within(screen.getByRole("group", { name: "3D projection" })).getByRole("button", { name: "Exploded axo" }));
    await user.click(within(screen.getByRole("toolbar", { name: "Model tools" })).getByRole("button", { name: "Views" }));
    await user.type(screen.getByRole("textbox", { name: "View name" }), "Huge");
    await user.click(screen.getByRole("button", { name: "Save" }));
    first.unmount();
    const stored = JSON.parse(window.localStorage.getItem("citycut.namedViews.v1")!) as {
      byCut: Record<string, { snapshot: Record<string, unknown> }[]>;
    };
    const [view] = Object.values(stored.byCut)[0]!;
    view!.snapshot.explodeGapM = 99999;
    window.localStorage.setItem("citycut.namedViews.v1", JSON.stringify(stored));

    render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    await user.click(within(screen.getByRole("toolbar", { name: "Model tools" })).getByRole("button", { name: "Views" }));
    await user.click(screen.getByRole("button", { name: /^Huge/, hidden: true }));
    expect(screen.getByTestId("scene-3d").dataset.exploded).toBe("true");
    expect(screen.getByTestId("scene-3d").getAttribute("data-explode-gap")).toBe("800");

    delete view!.snapshot.exploded;
    delete view!.snapshot.explodeGapM;
    window.localStorage.setItem("citycut.namedViews.v1", JSON.stringify(stored));
    cleanup();
    render(<ModelPage model={model} onHome={vi.fn()} onNewCut={vi.fn()} />);
    await user.click(within(screen.getByRole("toolbar", { name: "Model tools" })).getByRole("button", { name: "Views" }));
    await user.click(screen.getByRole("button", { name: /^Huge/, hidden: true }));
    expect(screen.getByTestId("scene-3d").dataset.exploded).toBe("false");
  });
});
