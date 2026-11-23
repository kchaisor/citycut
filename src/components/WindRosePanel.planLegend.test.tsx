// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { siteWindFromPublishedAsset } from "../lib/windAssetDisk";
import type { WindPlanState } from "./useWindPlan";
import { WindRosePanel } from "./WindRosePanel";

const pyrmont = siteWindFromPublishedAsset(-33.86627, 151.18389)!;

function stubPlan(mode: WindPlanState["mode"], scaleMaxMs: number | null, comfortShares: WindPlanState["comfortShares"] = null): WindPlanState {
  return {
    active: true,
    mode,
    setMode: () => {},
    vectorsOn: true,
    setVectorsOn: () => {},
    sector: 8,
    designWind: null,
    dirLabel: "S",
    selectSector: () => {},
    stepSector: () => {},
    sectorReferenceMs: () => 3.9,
    referenceMs: 5,
    hasData: true,
    ready: true,
    scaleMaxMs,
    speed: null,
    comfort: null,
    comfortShares,
  };
}

function renderCard(plan: WindPlanState) {
  return render(
    <div className="wind-rose-analysis-card is-plan hud-card">
      <WindRosePanel selection={pyrmont} period="annual" plan={plan} />
    </div>,
  );
}

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

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
    expect(card.querySelector(".wind-plan-comfort-shares")).toBeNull();
  });

  it("puts the Lawson bar, limits and site shares in the left comfort card, after the rose", () => {
    const shares = { sitting: 0.002, standing: 0.14, strolling: 0.71, walking: 0.148, uncomfortable: 0 };
    const { container } = renderCard(stubPlan("comfort", 8, shares));
    const card = container.querySelector(".wind-rose-panel.is-plan")!;
    const legend = card.querySelector(".wind-plan-comfort-legend")!;
    expect(legend.querySelector(".wind-plan-legend-title")?.textContent).toBe("Comfort (m/s, 5% of the time)");
    expect(legend.querySelectorAll(".wind-plan-comfort-bar > span")).toHaveLength(5);
    expect([...legend.querySelectorAll(".wind-plan-comfort-ticks > span")].map((el) => el.textContent)).toEqual(["4", "6", "8", "10"]);
    expect([...legend.querySelectorAll(".wind-plan-comfort-shares li")].map((li) => li.textContent)).toEqual([
      "Sitting<1%",
      "Standing14%",
      "Strolling71%",
      "Walking15%",
      "Uncomfortable0%",
    ]);
    expect(card.lastElementChild).toBe(legend);
    expect(card.querySelector(".wind-rose-panel-svg")!.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector(".wind-plan-comfort-legend.hud-card")).toBeNull();
    expect(card.querySelector(".wind-plan-velocity")).toBeNull();
  });

  it("names the comfort classes without shares until comfort is computed", () => {
    const { container } = renderCard(stubPlan("comfort", 8));
    const names = [...container.querySelectorAll(".wind-plan-comfort-shares li")].map((li) => li.textContent);
    expect(names).toEqual(["Sitting", "Standing", "Strolling", "Walking", "Uncomfortable"]);
    expect(container.querySelector(".wind-plan-comfort-share")).toBeNull();
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

  it("tucks the closer stations behind a closed Nearby stations disclosure, distances unbroken", () => {
    const { container } = renderCard(stubPlan("speed", 8));
    expect(container.querySelector(".wind-rose-meta-skipped")).toBeNull();
    const line = container.querySelector<HTMLDetailsElement>("details.wind-rose-nearby")!;
    expect(line.open).toBe(false);
    expect(line.querySelector("summary")?.textContent).toBe("Nearby stations");
    expect(line.textContent).not.toContain("Closer:");
    expect(line.querySelectorAll(".wind-rose-nearby-list li")).toHaveLength(3);
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
    expect(css).toMatch(
      /\.wind-rose-panel\.is-plan \.wind-rose-meta,\s*\.wind-rose-panel\.is-flow \.wind-rose-meta \{\s*font-size: 11px;\s*color: var\(--muted-text\);/,
    );
    expect(css).toMatch(/\.wind-rose-nearby \{[^}]*pointer-events: auto;/);
    expect(css).not.toMatch(/\.wind-rose-meta-skipped \{[^}]*line-clamp/);
  });

  it("draws Nearby stations as a 28px disclosure row with a chevron", () => {
    const { container } = renderCard(stubPlan("speed", 8));
    const summary = container.querySelector("details.wind-rose-nearby summary")!;
    expect(summary.querySelector("svg.wind-rose-nearby-chevron")).toBeTruthy();
    const css = source("src/index.css");
    expect(css).toMatch(/\.wind-rose-nearby summary \{[^}]*min-height: var\(--control-sm\);/);
  });

  it("puts Calm in the rose centre and one station footnote with the TMYx link", () => {
    const { container } = renderCard(stubPlan("speed", 8));
    const card = container.querySelector(".wind-rose-panel.is-plan")!;
    expect(card.querySelector(".wind-rose-calm-caption")).toBeNull();
    expect(card.querySelector(".wind-rose-chart .wind-rose-calm")?.textContent).toMatch(/^Calm \d+\.\d%$/);
    const notes = card.querySelectorAll(".wind-rose-footnote");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toContain("Regional station, not site wind · TMYx ↗");
    expect(notes[0]!.textContent).toMatch(/km · /);
    const link = notes[0]!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://climate.onebuilding.org/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps the velocity scale out of a separate model-page card", () => {
    const view = readFileSync(path.join(process.cwd(), "src/components/model/ModelPageView.tsx"), "utf8");
    expect(view).not.toContain("WindPlanVelocityLegend");
    expect(view).not.toContain("WindPlanInfo");
    expect(view).not.toContain("WindPlanComfortLegend");
    expect(view).not.toContain("useWindPlanLegendPlacement");
    expect(source("src/components/WindPlanCard.tsx")).not.toContain("WindPlanComfortLegend");
    expect(source("src/index.css")).not.toMatch(/\.wind-plan-comfort \{/);
  });
});
