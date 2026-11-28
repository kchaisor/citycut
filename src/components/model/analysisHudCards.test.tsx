// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DesignWind } from "../../lib/windDesignWinds";
import { resetWindStreakDensityCache } from "../../lib/windStreakDensity";
import type { WindViewSettings } from "../../lib/windState";
import type { SolarViewSettings } from "../SolarHeliodon";
import { AnalysisHudHarness as Hud } from "./analysisHudHarness";
import { windPrevailingBadge } from "./windRoseCard";
import { viewshedComputeLabel, viewshedReadout } from "./viewshedCard";
import { solarStudyCardMeta, sunDomeSizeNote } from "./solarStudyCard";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetWindStreakDensityCache();
});

const index = readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
const block = (selector: string) => {
  const start = index.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return index.slice(start, index.indexOf("}", start));
};

const card = (kind: "solar" | "wind" | "view") => document.querySelector<HTMLElement>(`[data-analysis-card="${kind}"]`);
const head = (kind: "solar" | "wind" | "view") => card(kind)!.querySelector<HTMLButtonElement>(".analysis-card-head")!;
const expanded = (kind: "solar" | "wind" | "view") => head(kind).getAttribute("aria-expanded") === "true";
const mode = (name: string) =>
  within(screen.getByRole("group", { name: "Analysis modes" })).getByRole("button", { name });
const labels = (group: HTMLElement) => within(group).getAllByRole("button").map((button) => button.textContent);

const DESIGN_WINDS: DesignWind[] = [
  { id: "design-ne", label: "NE", headingDeg: 45, sector: 2, stationMs: 5, referenceMs: 4, sharePct: 18 },
  { id: "design-s", label: "S", headingDeg: 180, sector: 8, stationMs: 6, referenceMs: 5, sharePct: 22 },
  { id: "design-w", label: "W", headingDeg: 270, sector: 12, stationMs: 7, referenceMs: 6, sharePct: 15 },
];

describe("analysis cards show only while their analysis is on", () => {
  it("has no card with nothing on, and adds or removes each card with its toggle", () => {
    render(<Hud />);
    expect(document.querySelector(".analysis-hud-card")).toBeNull();
    for (const [name, kind] of [
      ["Solar Study", "solar"],
      ["Wind Rose", "wind"],
      ["Viewshed Walk", "view"],
    ] as const) {
      fireEvent.click(mode(name));
      expect(card(kind), kind).toBeTruthy();
      expect(document.querySelectorAll(".analysis-hud-card")).toHaveLength(1);
      fireEvent.click(mode(name));
      expect(card(kind), kind).toBeNull();
    }
  });

  it("stacks Solar Study, Wind Rose and Viewshed Walk in that order", () => {
    render(<Hud initialKinds={["view", "wind", "solar"]} />);
    expect([...document.querySelectorAll("[data-analysis-card]")].map((el) => el.getAttribute("data-analysis-card"))).toEqual([
      "solar",
      "wind",
      "view",
    ]);
  });
});

describe("analysis card accordion", () => {
  it("opens the analysis turned on last and folds the others to their headers", () => {
    render(<Hud />);
    fireEvent.click(mode("Solar Study"));
    expect(expanded("solar")).toBe(true);
    fireEvent.click(mode("Wind Rose"));
    expect(expanded("wind")).toBe(true);
    expect(expanded("solar")).toBe(false);
    fireEvent.click(mode("Viewshed Walk"));
    expect([expanded("solar"), expanded("wind"), expanded("view")]).toEqual([false, false, true]);
    for (const kind of ["solar", "wind"] as const) {
      expect(card(kind)!.className).toContain("is-collapsed");
      expect(card(kind)!.querySelector(".analysis-card-body")).toBeNull();
      expect(card(kind)!.querySelector(".analysis-card-fold")!.hasAttribute("hidden")).toBe(true);
      expect(head(kind).querySelector(".card-title")).toBeTruthy();
      expect(head(kind).querySelector(".card-meta")).toBeTruthy();
    }
    expect(screen.queryByRole("slider", { name: "Solar time of day" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Wind season presets" })).toBeNull();
  });

  it("swaps the open body when a collapsed header is clicked, one body at a time", () => {
    render(<Hud />);
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) fireEvent.click(mode(name));
    fireEvent.click(head("solar"));
    expect([expanded("solar"), expanded("wind"), expanded("view")]).toEqual([true, false, false]);
    expect(screen.getByRole("slider", { name: "Solar time of day" })).toBeTruthy();
    fireEvent.click(head("wind"));
    expect([expanded("solar"), expanded("wind"), expanded("view")]).toEqual([false, true, false]);
    expect(document.querySelectorAll(".analysis-card-body")).toHaveLength(1);
    fireEvent.click(head("wind"));
    expect([expanded("solar"), expanded("wind"), expanded("view")]).toEqual([false, false, false]);
  });

  it("falls back to a remaining analysis when the open one is turned off", () => {
    render(<Hud />);
    fireEvent.click(mode("Solar Study"));
    fireEvent.click(mode("Wind Rose"));
    fireEvent.click(mode("Wind Rose"));
    expect(card("wind")).toBeNull();
    expect(expanded("solar")).toBe(true);
  });

  it("keeps every header a 48px row and lets an open body scroll inside its card", () => {
    expect(block(".analysis-card-head")).toMatch(/height: var\(--hud-card-head\);/);
    expect(block(".analysis-hud-card.is-collapsed")).toMatch(/flex: none;/);
    expect(block(".analysis-hud-card.is-collapsed")).toMatch(/min-height: var\(--hud-card-head\);/);
    expect(block(".analysis-hud-card")).toMatch(/flex: 0 1 auto;/);
    expect(block(".analysis-hud-card")).toMatch(/min-height: 0;/);
    expect(block(".analysis-card-body")).toMatch(/overflow-y: auto;/);
    expect(block(".analysis-card-body > *")).toMatch(/flex: none;/);
  });
});

describe("Solar Study card", () => {
  it("carries the readout, overlays, date presets, time slider and dome size that left the bar", () => {
    const calls: SolarViewSettings[] = [];
    render(<Hud onSolar={(next) => calls.push(next)} />);
    fireEvent.click(mode("Solar Study"));
    const solar = within(card("solar")!);
    expect(head("solar").textContent).toContain("Solar Study");
    expect(head("solar").querySelector(".card-meta")!.textContent).toBe(solarStudyCardMeta(calls.at(-1)!));
    const readout = solar.getByLabelText("Live solar telemetry");
    expect([...readout.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Alt", "Az", "Daylight"]);
    expect([...readout.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["12.0°", "300° NW", "9h 30m"]);
    expect(labels(solar.getByRole("group", { name: "Solar overlays" }))).toEqual(["Shadows", "Sun hours", "Sun dome"]);
    expect(solar.queryByRole("button", { name: "3D Sun Dome" })).toBeNull();
    const dates = solar.getByRole("group", { name: "Solar date presets" });
    expect(labels(dates)).toEqual(["21 JunWinter", "22 SepEquinox", "22 DecSummer"]);
    expect(within(dates).getByRole("button", { name: "21 Jun · Winter solstice" })).toBeTruthy();
    expect(solar.getByRole("button", { name: "Play solar animation" }).textContent).toBe("▶ 1×");
    expect(solar.getByTitle("Melbourne sunrise").textContent).toContain("07:36");
    expect(solar.getByTitle("Melbourne sunset").textContent).toContain("17:06");
    expect(labels(solar.getByRole("group", { name: "Solar hour scrubber" }))).toEqual(["06", "09", "12", "15", "18", "20"]);
    expect(solar.getByRole("slider", { name: "Sun dome size" })).toBeTruthy();
  });

  it("toggles Shadows, Sun hours and the dome, and fills the selected date with ink", () => {
    const calls: SolarViewSettings[] = [];
    render(<Hud onSolar={(next) => calls.push(next)} initialKinds={["solar"]} />);
    const hours = screen.getByRole("button", { name: "Sun hours" });
    expect(hours.getAttribute("aria-pressed")).toBe("false");
    expect(hours.className).toBe("ac-seg-btn");
    fireEvent.click(hours);
    expect(calls.at(-1)?.sunHours).toBe(true);
    expect(hours.className).toBe("ac-seg-btn is-on");
    expect(document.querySelectorAll("[data-sun-hours-ground-chip]")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Shadows" }));
    expect(calls.at(-1)?.castShadows).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sun dome" }));
    expect(calls.at(-1)?.showPath).toBe(true);
    const winter = screen.getByRole("button", { name: "21 Jun · Winter solstice" });
    fireEvent.click(winter);
    expect(calls.at(-1)).toMatchObject({ month: 6, day: 21 });
    expect(winter.className).toBe("ac-date-pill is-ink");
    const ink = block(".ac-seg-btn.is-ink,\n.ac-play.is-ink,\n.ac-date-pill.is-ink");
    expect(ink).toContain("background: var(--ink);");
    expect(ink).toContain("color: var(--on-ink);");
    expect(ink).not.toContain("--accent");
  });

  it("runs the time slider from 06:00 to 20:00 and shows the time on a left-aligned badge", () => {
    render(<Hud initialKinds={["solar"]} />);
    const slider = screen.getByRole("slider", { name: "Solar time of day" }) as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(["360", "1200"]);
    fireEvent.change(slider, { target: { value: "1200" } });
    const badge = card("solar")!.querySelector(".ac-badge")!;
    expect(badge.textContent).toContain("20:00 AEST");
    fireEvent.click(screen.getByRole("button", { name: "Solar time 09:00" }));
    expect(badge.textContent).toContain("09:00 AEST");
    expect(block(".ac-badge")).toMatch(/justify-self: start;/);
    expect(block(".ac-badge")).not.toMatch(/margin-left: auto/);
  });

  it("keeps the 9–3pm Plan Fan with the overlays on the Drawing site plan", () => {
    const calls: SolarViewSettings[] = [];
    render(<Hud initialKinds={["solar"]} tab="drawing" onSolar={(next) => calls.push(next)} />);
    const overlays = screen.getByRole("group", { name: "Solar overlays" });
    expect(labels(overlays)).toEqual(["Shadows", "Sun hours", "Sun dome", "9–3pm Plan Fan"]);
    fireEvent.click(within(overlays).getByRole("button", { name: "9–3pm Plan Fan" }));
    expect(calls.at(-1)?.sunStudy).toBe(true);
  });

  it("puts the Direct Sun Hours legend inside the card, not in a card of its own", () => {
    render(<Hud initialKinds={["solar"]} sunHoursReady />);
    expect(card("solar")!.querySelector("[data-sun-hours-ground-legend-dock]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sun hours" }));
    const legend = card("solar")!.querySelector("[data-sun-hours-ground-legend-dock]")!;
    expect(legend.className).toBe("sun-hours-card-legend");
    expect(legend.textContent).toContain("Direct Sun Hours");
    expect(document.querySelector(".sun-hours-hud-card")).toBeNull();
    const sidebar = readFileSync(path.join(process.cwd(), "src/components/model/ModelPageSidebar.tsx"), "utf8");
    expect(sidebar).toContain("const sunHoursLegendAlone = sunHoursLegendOn && !analysisCards.solar;");
  });

  it("titles the legend with the study date, the window and hours, and switches Whole day / 9am–3pm", () => {
    const calls: SolarViewSettings[] = [];
    render(<Hud initialKinds={["solar"]} sunHoursReady onSolar={(next) => calls.push(next)} />);
    expect(screen.queryByRole("group", { name: "Sun hours window" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sun hours" }));
    const title = () => card("solar")!.querySelector(".sun-hours-direct-legend-title")!.textContent;
    const windows = screen.getByRole("group", { name: "Sun hours window" });
    expect(windows.className).toBe("ac-seg ac-seg-2");
    expect(labels(windows)).toEqual(["Whole day", "9am–3pm"]);
    const wholeDay = within(windows).getByRole("button", { name: "Whole day" });
    const nineToThree = within(windows).getByRole("button", { name: "9am–3pm" });
    expect(wholeDay.className).toBe("ac-seg-btn is-ink");
    expect(nineToThree.className).toBe("ac-seg-btn");
    expect(title()).toBe("Direct Sun Hours · 22 Sep · full daylight");
    expect(card("solar")!.querySelector(".sun-hours-direct-legend-unit")!.textContent).toBe("hours");
    fireEvent.click(nineToThree);
    expect(calls.at(-1)).toMatchObject({ sunHoursWindow: "9to3", month: 9, day: 22, sunHours: true });
    expect(nineToThree.className).toBe("ac-seg-btn is-ink");
    expect(nineToThree.getAttribute("aria-pressed")).toBe("true");
    expect(wholeDay.className).toBe("ac-seg-btn");
    expect(title()).toBe("Direct Sun Hours · 22 Sep · 9am–3pm");
    fireEvent.click(screen.getByRole("button", { name: "21 Jun · Winter solstice" }));
    expect(calls.at(-1)).toMatchObject({ sunHoursWindow: "9to3", month: 6, day: 21 });
    expect(title()).toBe("Direct Sun Hours · 21 Jun · 9am–3pm");
  });

  it("offers Colour only selected, off by default, with a hint until a building is picked", () => {
    const calls: SolarViewSettings[] = [];
    const { rerender } = render(<Hud initialKinds={["solar"]} sunHoursReady onSolar={(next) => calls.push(next)} />);
    expect(screen.queryByRole("button", { name: "Colour only selected" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sun hours" }));
    const only = screen.getByRole("button", { name: "Colour only selected" });
    expect(only.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-sun-hours-pick-hint]")).toBeNull();
    fireEvent.click(only);
    expect(calls.at(-1)?.sunHoursPickedOnly).toBe(true);
    expect(only.className).toBe("ac-seg-btn is-on");
    expect(document.querySelector("[data-sun-hours-pick-hint]")!.textContent).toBe(
      "Click a building to colour it. Shift-click adds.",
    );
    rerender(<Hud initialKinds={["solar"]} sunHoursReady onSolar={(next) => calls.push(next)} pickedBuildingIds={[7]} />);
    expect(document.querySelector("[data-sun-hours-pick-hint]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Colour only selected" }));
    expect(calls.at(-1)?.sunHoursPickedOnly).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sun hours" }));
    expect(screen.queryByRole("button", { name: "Colour only selected" })).toBeNull();
  });
});

describe("Sun dome size slider", () => {
  it("runs from half the auto radius to twice the cut edge, starts on auto and reads out metres", () => {
    render(<Hud initialKinds={["solar"]} sideM={500} />);
    fireEvent.click(screen.getByRole("button", { name: "Sun dome" }));
    const slider = screen.getByRole("slider", { name: "Sun dome size" }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["106", "707", "212"]);
    expect(slider.disabled).toBe(false);
    const group = screen.getByRole("group", { name: "Sun dome size" });
    expect(group.querySelector("output")!.textContent).toBe("212 m");
    expect(group.textContent).toContain("Auto 212 m for this cut · up to 2× the cut edge, 707 m");
    expect(group.textContent).toContain("2× cut");
    fireEvent.change(slider, { target: { value: "300" } });
    expect(group.querySelector("output")!.textContent).toBe("300 m");
    fireEvent.change(slider, { target: { value: "9999" } });
    expect(group.querySelector("output")!.textContent).toBe("707 m");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(group.querySelector("output")!.textContent).toBe("106 m");
    fireEvent.change(slider, { target: { value: "213" } });
    expect(group.querySelector("output")!.textContent).toBe("212 m");
    expect(slider.getAttribute("aria-valuetext")).toBe("212 m, auto");
  });

  it("covers the Rozelle A3 sheet from 175 m to 1801 m (2× the cut edge) with 350 m as the default", () => {
    render(<Hud initialKinds={["solar"]} sideM={1470} cut={{ widthM: 1470, heightM: 1040 }} />);
    const slider = screen.getByRole("slider", { name: "Sun dome size" }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["175", "1801", "350"]);
  });

  it("is muted with a short note while the sun dome is off", () => {
    render(<Hud initialKinds={["solar"]} />);
    const group = screen.getByRole("group", { name: "Sun dome size" });
    const slider = screen.getByRole("slider", { name: "Sun dome size" }) as HTMLInputElement;
    expect(group.className).toBe("ac-section is-muted");
    expect(slider.disabled).toBe(true);
    expect(group.textContent).toContain(sunDomeSizeNote({ autoM: 212, maxM: 354 }, false));
    fireEvent.click(screen.getByRole("button", { name: "Sun dome" }));
    expect(group.className).toBe("ac-section");
    expect(slider.disabled).toBe(false);
  });

  it("does not use the old heliodon radius factor", () => {
    const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    expect(source("src/components/model/SolarStudyHudCard.tsx")).not.toMatch(/radiusFactor|HELIODON_RADIUS/);
    expect(source("src/components/SolarHeliodon.tsx")).toContain("const radius = radiusM ?? sunDomeRadiusM(sideM);");
    expect(source("src/components/SolarHeliodon.tsx")).not.toMatch(/AutoFit|controls\.target/);
  });
});

describe("Wind Rose card", () => {
  it("carries the seasons, design winds, prevailing badge and Flow / Streaks / Pause that left the bar", () => {
    const winds: WindViewSettings[] = [];
    render(<Hud onWind={(next) => winds.push(next)} designWinds={DESIGN_WINDS} />);
    fireEvent.click(mode("Wind Rose"));
    const wind = within(card("wind")!);
    const seasons = wind.getByRole("group", { name: "Wind season presets" });
    expect(labels(seasons)).toEqual(["Annual", "Summer", "Autumn", "Winter", "Spring"]);
    expect(seasons.className).toBe("ac-seg ac-seg-5");
    expect(within(seasons).getByRole("button", { name: "Annual" }).className).toBe("ac-seg-btn is-ink");
    fireEvent.click(within(seasons).getByRole("button", { name: "Winter" }));
    expect(winds.at(-1)?.period).toBe("winter");
    const design = wind.getByRole("group", { name: "Design winds" });
    expect(labels(design)).toEqual(["NE", "S", "W"]);
    expect(design.className).toContain("ac-seg-compact");
    fireEvent.click(within(design).getByRole("button", { name: "Design wind S" }));
    expect(winds.at(-1)?.designWind).toBe("design-s");
    expect(within(seasons).getByRole("button", { name: "Winter" }).getAttribute("aria-pressed")).toBe("false");
    expect(wind.getByText("Prevailing")).toBeTruthy();
    expect(labels(wind.getByRole("group", { name: "Wind overlay toggles" }))).toEqual(["Flow", "Streaks", "❚❚ Pause"]);
  });

  it("keeps All day selected until Morning or Afternoon is picked, and shows the hour windows", () => {
    const winds: WindViewSettings[] = [];
    render(<Hud onWind={(next) => winds.push(next)} />);
    fireEvent.click(mode("Wind Rose"));
    const wind = within(card("wind")!);
    const times = wind.getByRole("group", { name: "Wind time of day" });
    expect(labels(times)).toEqual(["All day", "Morning", "Afternoon"]);
    expect(times.className).toBe("ac-seg ac-seg-3");
    expect(within(times).getByRole("button", { name: "All day" }).className).toBe("ac-seg-btn is-ink");
    expect(wind.getByText("6am–12pm · 12pm–6pm · local standard time")).toBeTruthy();
    fireEvent.click(within(times).getByRole("button", { name: "Morning" }));
    expect(winds.at(-1)?.daypart).toBe("morning");
  });

  it("names the prevailing badge from the station data and never invents it", () => {
    const stats = { prevailingLabel: "S, SSW", prevailingMedianKmh: 21.2, prevailingMeanSpeedMs: 5.9, calmPercent: 12.6 };
    expect(windPrevailingBadge(stats, false)).toEqual({ prevailing: "S, SSW · 21 km/h", calm: "Calm 12.6%" });
    expect(windPrevailingBadge(stats, true).prevailing).toBe("S, SSW · 5.9 m/s");
    expect(windPrevailingBadge(null, false)).toEqual({ prevailing: "—", calm: null });
    expect(block(".ac-badge")).toMatch(/align-self: flex-start;/);
  });

  it("switches Flow and Streaks independently, both on when Wind Rose turns on", () => {
    const winds: WindViewSettings[] = [];
    render(<Hud onWind={(next) => winds.push(next)} />);
    fireEvent.click(mode("Wind Rose"));
    const flow = () => screen.getByRole("button", { name: "3D Wind Flow" });
    const streaks = () => screen.getByRole("button", { name: "Wind streaks" });
    expect(flow().textContent).toBe("Flow");
    expect(streaks().textContent).toBe("Streaks");
    expect(flow().getAttribute("aria-pressed")).toBe("true");
    expect(streaks().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(flow());
    expect(winds.at(-1)?.enabled).toBe(false);
    expect(streaks().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(flow());
    fireEvent.click(streaks());
    expect(flow().getAttribute("aria-pressed")).toBe("true");
    expect(streaks().getAttribute("aria-pressed")).toBe("false");
  });

  it("pauses and plays the wind animation, starting paused under reduced motion", () => {
    render(<Hud />);
    fireEvent.click(mode("Wind Rose"));
    const pause = screen.getByRole("button", { name: "Pause wind animation" });
    expect(pause.getAttribute("data-wind-paused")).toBe("false");
    fireEvent.click(pause);
    const play = screen.getByRole("button", { name: "Play wind animation" });
    expect(play.textContent).toBe("▶ Play");
    fireEvent.click(play);
    expect(screen.getByRole("button", { name: "Pause wind animation" })).toBeTruthy();
    cleanup();
    render(<Hud reducedMotion />);
    fireEvent.click(mode("Wind Rose"));
    expect(screen.getByRole("button", { name: "Play wind animation" }).getAttribute("data-wind-paused")).toBe("true");
  });

  it("labels the density slider Density, on one row, only while the ground flow runs", () => {
    render(<Hud />);
    fireEvent.click(mode("Wind Rose"));
    const slider = screen.getByRole("slider", { name: "Density" });
    expect(screen.queryByRole("slider", { name: "Wind streaks" })).toBeNull();
    const row = slider.closest(".wind-streaks-row")!;
    expect(row.querySelector(".wind-streaks-title")!.textContent).toBe("Density");
    expect(row.querySelector("output")!.textContent).toBe("1.0×");
    fireEvent.click(screen.getByRole("button", { name: "3D Wind Flow" }));
    expect(screen.queryByRole("slider", { name: "Density" })).toBeNull();
  });

  it("swaps the overlays for the Wind speed / Comfort switch in Plan, as before", () => {
    render(<Hud projection="plan" />);
    fireEvent.click(mode("Wind Rose"));
    const wind = within(card("wind")!);
    expect(wind.queryByRole("group", { name: "Wind overlay toggles" })).toBeNull();
    expect(wind.queryByRole("slider", { name: "Density" })).toBeNull();
    const comfort = wind.getByRole("button", { name: "Comfort" });
    fireEvent.click(comfort);
    expect(comfort.getAttribute("aria-pressed")).toBe("true");
    expect(wind.getByRole("button", { name: "Wind speed" }).getAttribute("aria-pressed")).toBe("false");
    expect(wind.getByRole("button", { name: "Arrows" }).getAttribute("aria-pressed")).toBe("true");
    expect(wind.getByRole("group", { name: "Wind season presets" })).toBeTruthy();
  });

  it("offers Wind map | Flow in Plan, with Wind map showing today's plan content", () => {
    render(<Hud projection="plan" />);
    fireEvent.click(mode("Wind Rose"));
    const wind = within(card("wind")!);
    const choice = wind.getByRole("group", { name: "Plan wind view" });
    expect(within(choice).getByText("Wind map")).toBeTruthy();
    expect(within(choice).getByRole("button", { name: "Wind map" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(choice).getByRole("button", { name: "Flow" }).getAttribute("aria-pressed")).toBe("false");
    expect(wind.getByRole("button", { name: "Wind speed" })).toBeTruthy();
    expect(wind.queryByRole("group", { name: "Wind overlay toggles" })).toBeNull();
  });

  it("reveals the Overlays row and the Density slider with Flow chosen in Plan, and hides the map-only controls", () => {
    render(<Hud projection="plan" />);
    fireEvent.click(mode("Wind Rose"));
    const wind = within(card("wind")!);
    fireEvent.click(wind.getByRole("button", { name: "Flow" }));
    expect(wind.getByRole("button", { name: "Flow" }).getAttribute("aria-pressed")).toBe("true");
    const overlays = wind.getByRole("group", { name: "Wind overlay toggles" });
    expect(within(overlays).getByRole("button", { name: "3D Wind Flow" })).toBeTruthy();
    expect(within(overlays).getByRole("button", { name: "Wind streaks" })).toBeTruthy();
    expect(within(overlays).getByRole("button", { name: /wind animation/ })).toBeTruthy();
    expect(wind.getByRole("slider", { name: "Density" })).toBeTruthy();
    expect(wind.queryByRole("button", { name: "Wind speed" })).toBeNull();
    expect(wind.queryByRole("button", { name: "Arrows" })).toBeNull();
    expect(card("wind")!.className).not.toContain("is-plan");
    fireEvent.click(wind.getByRole("button", { name: "Wind map" }));
    expect(wind.queryByRole("group", { name: "Wind overlay toggles" })).toBeNull();
    expect(wind.getByRole("button", { name: "Wind speed" })).toBeTruthy();
  });

  it("does not show the Plan wind view choice in Perspective", () => {
    render(<Hud />);
    fireEvent.click(mode("Wind Rose"));
    expect(within(card("wind")!).queryByRole("group", { name: "Plan wind view" })).toBeNull();
  });

  it("keeps the rose full card width while another analysis shares the stack", () => {
    render(<Hud initialKinds={["wind"]} />);
    expect(card("wind")!.className).not.toContain("is-tight");
    fireEvent.click(mode("Solar Study"));
    expect(card("wind")!.className).toContain("is-tight");
    const tight = block(".analysis-hud-card.is-tight .wind-rose-chart");
    expect(tight).toMatch(/width: 100%;/);
    const cardChart = block(".wind-rose-analysis-card .wind-rose-chart");
    expect(cardChart).toMatch(/width: 100%;/);
  });
});

describe("Viewshed Walk card", () => {
  it("carries Draw path, Compute, eye height, radius, walk speeds, Clear, the slider and the legend", () => {
    const calls: string[] = [];
    render(<Hud onWalk={(call) => calls.push(call)} walk={{ clickCount: 3, sampleCount: 121, lengthM: 240, status: "drawn" }} />);
    fireEvent.click(mode("Viewshed Walk"));
    const view = within(card("view")!);
    expect(head("view").querySelector(".card-meta")!.textContent).toBe("1.6 m · 200 m");
    const path = view.getByRole("group", { name: "Viewshed overlay toggles" });
    expect(labels(path)).toEqual(["Draw path", "Compute"]);
    expect(path.className).toBe("ac-seg ac-seg-2");
    fireEvent.click(view.getByRole("button", { name: "Draw path" }));
    expect(view.getByRole("button", { name: "Drawing path…" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "Compute" }));
    expect(labels(view.getByRole("group", { name: "Eye height" }))).toEqual(["1.6 m", "4.5 m", "10 m"]);
    expect(labels(view.getByRole("group", { name: "Radius" }))).toEqual(["100 m", "200 m", "400 m"]);
    expect(view.getByRole("button", { name: "1.6 m" }).getAttribute("aria-pressed")).toBe("true");
    expect(view.getByRole("button", { name: "200 m" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "4.5 m" }));
    fireEvent.click(view.getByRole("button", { name: "400 m" }));
    expect(head("view").querySelector(".card-meta")!.textContent).toBe("4.5 m · 400 m");
    expect(labels(view.getByRole("group", { name: "Walk speed" }))).toEqual(["1×", "4×", "8×"]);
    fireEvent.click(view.getByRole("button", { name: "8× walk speed" }));
    expect(view.getByRole("button", { name: "8× walk speed" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "Clear" }));
    const slider = view.getByRole("slider", { name: "Position along walk" }) as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(["0", "120"]);
    fireEvent.change(slider, { target: { value: "42" } });
    expect(calls).toEqual(["compute", "clear", "play", "seek 42"]);
    expect(card("view")!.querySelector(".ac-badge")!.textContent).toBe("0 / 240 m · 4.5 m · 400 m");
    const legend = view.getByLabelText("View legend");
    expect([...legend.querySelectorAll("span")].map((item) => item.textContent?.trim())).toEqual([
      "Visible now",
      "Seen on walk",
      "Not visible",
      "Path",
    ]);
  });

  it("holds Compute, Play, Clear and the slider until there is a path", () => {
    render(<Hud initialKinds={["view"]} />);
    const view = within(card("view")!);
    expect((view.getByRole("button", { name: "Compute" }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "Play walk" }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "Clear" }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole("slider", { name: "Position along walk" }) as HTMLInputElement).disabled).toBe(true);
    expect(card("view")!.querySelector(".ac-badge")!.textContent).toBe("1.6 m · 200 m");
    expect(viewshedComputeLabel({ status: "computing", progress: 0.4 })).toBe("Computing 40%");
    expect(viewshedComputeLabel({ status: "ready", progress: 1 })).toBe("Computed");
    expect(viewshedReadout({ sampleCount: 121, lengthM: 240, eyeM: 1.6, radiusM: 200 }, 84)).toBe("84 / 240 m · 1.6 m · 200 m");
  });

  it("draws the legend inside the card, not floating over the viewport", () => {
    const floating = readFileSync(path.join(process.cwd(), "src/floating.css"), "utf8");
    const start = floating.indexOf(".view-legend {");
    expect(floating.slice(start, floating.indexOf("}", start))).not.toMatch(/position: absolute/);
  });
});

describe("shared 328px card layout", () => {
  it("keeps every card button on a single line in equal-width rows", () => {
    expect(block(".ac-seg-btn,\n.ac-play")).toMatch(/white-space: nowrap;/);
    expect(block(".ac-seg-2")).toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
    expect(block(".ac-seg-3")).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    expect(block(".ac-seg-5")).toMatch(/repeat\(5, minmax\(0, 1fr\)\)/);
    expect(block(".ac-date-pill")).toMatch(/white-space: nowrap;/);
    expect(block(".ac-seg-compact")).toMatch(/justify-content: start;/);
  });

  it("starts readout values and pills on one left-aligned label column", () => {
    expect(block(".ac-kv")).toMatch(/grid-template-columns: var\(--analysis-label-col\) minmax\(0, 1fr\);/);
    expect(readFileSync(path.join(process.cwd(), "src/theme.css"), "utf8")).toMatch(/--analysis-label-col: 80px;/);
    expect(block(".ac-slider-head")).not.toMatch(/space-between/);
    expect(index).not.toMatch(/\.ac-[a-z-]+ \{[^}]*margin-left: auto/);
  });

  it("uses the short labels that fit: Sun dome, Flow and Streaks", () => {
    render(<Hud initialKinds={["solar", "wind"]} />);
    fireEvent.click(head("solar"));
    expect(screen.getByRole("button", { name: "Sun dome" })).toBeTruthy();
    fireEvent.click(head("wind"));
    expect(screen.queryByText("3D Wind Flow")).toBeNull();
    expect(screen.queryByText("Wind streaks")).toBeNull();
  });
});
