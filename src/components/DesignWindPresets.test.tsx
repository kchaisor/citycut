// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CityModel } from "../types";
import { designWindsFor, findDesignWind } from "../lib/windDesignWinds";
import type { SiteWindSelection } from "../lib/windRoseData";
import { siteWindFromPublishedAsset } from "../lib/windAssetDisk";
import { DEFAULT_WIND_SETTINGS, withDesignWind, withWindSeason } from "../lib/windState";
import { DesignWindPresets } from "./DesignWindPresets";
import { useWindPlan } from "./useWindPlan";
import { WindPlanRows } from "./WindPlanCard";

const pyrmont = siteWindFromPublishedAsset(-33.86627, 151.18389)!;

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
    expect(screen.queryByRole("button", { name: "Next wind direction" })).toBeNull();

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
    expect(screen.getByText("S · 180°")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Winter" }));
    });
    expect(window.__citycutWindPlan?.season).toBe("winter");
    expect(screen.getByRole("button", { name: "Design wind S" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("WindPlanRows water note", () => {
  afterEach(cleanup);

  const plan = {
    active: true,
    mode: "speed" as const,
    setMode: () => {},
    vectorsOn: true,
    setVectorsOn: () => {},
    sector: 12,
    designWind: null,
    dirLabel: "W",
    selectSector: () => {},
    stepSector: () => {},
    restoreSector: () => {},
    sectorReferenceMs: () => null,
    referenceMs: 3.4,
    hasData: true,
    ready: true,
    scaleMaxMs: 4,
    speed: null,
    comfort: null,
    comfortShares: null,
  };

  it("makes no claim about wind over water, which the plan leaves unpainted", () => {
    render(<WindPlanRows plan={plan} period="annual" />);
    expect(screen.getByText("3.4 m/s")).toBeTruthy();
    expect(screen.queryByText(/water/i)).toBeNull();
  });
});
