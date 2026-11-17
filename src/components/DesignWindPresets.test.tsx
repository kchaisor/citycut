// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind } from "../lib/windDesignWinds";
import type { SiteWindSelection, WindRoseAsset } from "../lib/windRoseData";
import { DEFAULT_WIND_SETTINGS, withDesignWind, withWindSeason } from "../lib/windState";
import { siteWindSelection } from "../lib/windStation";
import { DesignWindPresets } from "./DesignWindPresets";
import { useWindPlan } from "./useWindPlan";
import { WindPlanRows } from "./WindPlanCard";

const asset = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/wind/australia-tmyx.json"), "utf8"),
) as WindRoseAsset;
const pyrmont = siteWindSelection(asset, -33.86627, 151.18389)!;

const openModel: CityModel = {
  placeLabel: "Test",
  center: { lon: 151.18389, lat: -33.86627 },
  sideM: 240,
  layers: { buildings: true, roads: true, waterGreen: true, trees: true },
  buildings: [],
  roads: [],
  areas: [],
  trees: [],
  roadKm: 0,
  buildingCapHit: false,
  sourceNote: "",
};

function Harness({ selection }: { selection: SiteWindSelection }) {
  const [settings, setSettings] = useState(DEFAULT_WIND_SETTINGS);
  const winds = designWindsFor(selection);
  const designWind = findDesignWind(winds, settings.designWind);
  const plan = useWindPlan({ model: openModel, siteWind: selection, period: settings.period, designWind, active: true });
  return (
    <>
      <button type="button" onClick={() => setSettings(withWindSeason(settings, "winter"))}>
        Winter
      </button>
      <DesignWindPresets
        winds={winds}
        selectedId={settings.designWind}
        onSelect={(id) => setSettings(withDesignWind(settings, id))}
      />
      <WindPlanRows plan={plan} period={settings.period} />
    </>
  );
}

describe("DesignWindPresets", () => {
  afterEach(cleanup);

  it("renders NE, S and W for Pyrmont and picking one fixes the plan heading and speed", () => {
    render(<Harness selection={pyrmont} />);
    for (const label of ["NE", "S", "W"]) {
      expect(screen.getByRole("button", { name: `Design wind ${label}` }).textContent).toBe(label);
    }
    expect(screen.getByRole("button", { name: "Next wind direction" })).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Design wind S" }));
    });
    const south = findDesignWind(designWindsFor(pyrmont), "design-s")!;
    expect(screen.getByRole("button", { name: "Design wind S" }).getAttribute("aria-pressed")).toBe("true");
    expect(window.__citycutWindPlan?.season).toBe("design-s");
    expect(window.__citycutWindPlan?.dirDeg).toBe(180);
    expect(window.__citycutWindPlan?.referenceMs).toBeCloseTo(south.referenceMs, 9);
    expect(screen.getByText("Design wind")).toBeTruthy();
    expect(screen.getByText(`S · ${Math.round(south.sharePct)}% of hours`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next wind direction" })).toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Winter" }));
    });
    expect(window.__citycutWindPlan?.season).toBe("winter");
    expect(screen.getByRole("button", { name: "Design wind S" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("WindPlanRows water note", () => {
  afterEach(cleanup);

  const plan = (overWater: boolean) => ({
    active: true,
    mode: "speed" as const,
    setMode: () => {},
    sector: 12,
    designWind: null,
    dirLabel: "W",
    stepSector: () => {},
    referenceMs: 3.4,
    hasData: true,
    ready: true,
    overWater,
    speed: null,
    comfort: null,
  });

  it("says wind runs faster over water only when the site has water", () => {
    const { rerender } = render(<WindPlanRows plan={plan(true)} period="annual" />);
    expect(screen.getByText("Faster over water (smoother surface)")).toBeTruthy();
    expect(screen.getByText("3.4 m/s")).toBeTruthy();
    rerender(<WindPlanRows plan={plan(false)} period="annual" />);
    expect(screen.queryByText("Faster over water (smoother surface)")).toBeNull();
  });
});
