// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WindRoseAsset } from "../lib/windRoseData";
import { siteWindSelection } from "../lib/windStation";
import type { WindPlanState } from "./useWindPlan";
import { WindRosePanel } from "./WindRosePanel";

const asset = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/wind/australia-tmyx.json"), "utf8"),
) as WindRoseAsset;
const pyrmont = siteWindSelection(asset, -33.86627, 151.18389)!;

function stubPlan(mode: WindPlanState["mode"], scaleMaxMs: number | null): WindPlanState {
  return {
    active: true,
    mode,
    setMode: () => {},
    sector: 8,
    designWind: null,
    dirLabel: "S",
    selectSector: () => {},
    stepSector: () => {},
    sectorReferenceMs: () => 3.9,
    referenceMs: 5,
    hasData: true,
    ready: true,
    overWater: false,
    scaleMaxMs,
    speed: null,
    comfort: null,
  };
}

function renderCard(plan: WindPlanState) {
  return render(
    <div className="wind-rose-analysis-card is-plan hud-card">
      <WindRosePanel selection={pyrmont} period="annual" plan={plan} />
    </div>,
  );
}

function ticks(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".wind-plan-velocity-ticks > span")].map((el) => el.textContent ?? "");
}

describe("WindRosePanel plan legend", () => {
  afterEach(cleanup);

  it("puts the velocity scale inside the plan wind card and no separate card", () => {
    const { container } = renderCard(stubPlan("speed", 8));
    const card = container.querySelector(".wind-rose-panel.is-plan")!;
    const legend = card.querySelector(".wind-plan-velocity")!;
    expect(legend).toBeTruthy();
    expect(legend.querySelector(".wind-plan-legend-title")?.textContent).toBe("Velocity (m/s)");
    expect(legend.querySelector(".wind-plan-velocity-bar")).toBeTruthy();
    expect(card.lastElementChild).toBe(legend);
    expect(document.querySelector(".wind-plan-velocity.hud-card")).toBeNull();
    expect(card.querySelector(".wind-plan-swatches")).toBeNull();
  });

  it("keeps the Lawson key in comfort without a speed bar", () => {
    const { container } = renderCard(stubPlan("comfort", 8));
    const card = container.querySelector(".wind-rose-panel.is-plan")!;
    expect(card.querySelector(".wind-plan-swatches")).toBeTruthy();
    expect(card.querySelector(".wind-plan-velocity")).toBeNull();
    expect(card.querySelector(".wind-plan-velocity-bar")).toBeNull();
  });

  it("fits the ticks to the site scale and hides them until it is known", () => {
    expect(ticks(renderCard(stubPlan("speed", 4)).container)).toEqual(["0", "1", "2", "3", "4"]);
    cleanup();
    const eight = renderCard(stubPlan("speed", 8)).container;
    expect(ticks(eight)).toEqual(["0", "2", "4", "6", "8"]);
    const spans = [...eight.querySelectorAll<HTMLElement>(".wind-plan-velocity-ticks > span")];
    expect(spans[0]!.style.left).toBe("0%");
    expect(spans.at(-1)!.style.left).toBe("100%");
    cleanup();
    expect(ticks(renderCard(stubPlan("speed", null)).container)).toEqual([]);
  });

  it("keeps each closer-station distance as one unbreakable unit", () => {
    const { container } = renderCard(stubPlan("speed", 8));
    const line = container.querySelector<HTMLElement>(".wind-rose-meta-skipped")!;
    const text = line.textContent ?? "";
    expect(text).toContain("Canterbury Park Racecourse 7.9 km");
    expect(text).not.toMatch(/\b79 km/);
    const dists = [...line.querySelectorAll(".wind-rose-skip-dist")].map((el) => el.textContent);
    expect(dists).toEqual(["2.0 km", "4.8 km", "7.9 km"]);
    expect(line.title).toBe(
      "Closer: Sydney Observatory Hill 2.0 km · Riverview Observatory 4.8 km · Canterbury Park Racecourse 7.9 km (harbour site: Sydney Airport preferred)",
    );
    const css = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/\.wind-rose-skip-dist \{\s*white-space: nowrap;/);
    expect(css).not.toMatch(/\.wind-rose-meta-skipped \{[^}]*line-clamp/);
  });

  it("drops the right-side velocity card from the model page", () => {
    const view = readFileSync(path.join(process.cwd(), "src/components/model/ModelPageView.tsx"), "utf8");
    expect(view).not.toContain("WindPlanVelocityLegend");
    expect(view).not.toContain("--wind-plan-legend-");
  });
});
