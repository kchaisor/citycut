// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NO_ANALYSES, analysesOf, type ActiveAnalyses, type SiteAnalysisKind } from "../../lib/sidebarSections";
import { DEFAULT_WIND_SETTINGS, type WindViewSettings } from "../../lib/windState";
import { windMotionPaused } from "../../lib/windStreakMotion";
import type { SolarViewSettings } from "../SolarHeliodon";
import { initialSolarSettings } from "./initialSolarSettings";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import type { ModelPageViewModel } from "./useModelPage";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

type FooterProps = {
  onSolar?: (next: SolarViewSettings) => void;
  onWind?: (next: WindViewSettings) => void;
  initialKind?: SiteAnalysisKind | null;
  reducedMotion?: boolean;
  tab?: "3d" | "drawing" | "satellite";
};

function Footer({ onSolar = () => undefined, onWind = () => undefined, initialKind = null, tab = "3d", reducedMotion = false }: FooterProps) {
  const [solar, setSolar] = useState(() => initialSolarSettings("", emptyStorage));
  const [analyses, setAnalyses] = useState<ActiveAnalyses>(initialKind ? analysesOf(initialKind) : NO_ANALYSES);
  const [windStreaksOn, setWindStreaksOn] = useState(false);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const paused = windMotionPaused({ systemReduced: reducedMotion, animateAnyway: false, userPaused });
  const [windSettings, setWindSettings] = useState<WindViewSettings>(DEFAULT_WIND_SETTINGS);
  const [renderQuality, setRenderQuality] = useState<"high" | "fast">("high");
  const vm = {
    analyses,
    commitRenderQuality: setRenderQuality,
    renderQuality,
    commitSolar: (next: SolarViewSettings) => {
      onSolar(next);
      setSolar(next);
    },
    commitWind: (next: WindViewSettings) => {
      onWind(next);
      setWindSettings(next);
    },
    consoleDaylight: { sunrise: 456, sunset: 1026 },
    consolePlaying: false,
    consoleSun: { altitudeDeg: 12, azimuthDeg: 300 },
    consoleWindStats: null,
    designWinds: [],
    designWind: null,
    drawing: "site",
    model: { buildings: [] },
    setAnalyses,
    setWindStreaksOn,
    windStreaksOn,
    windMotion: { paused, setPaused: setUserPaused, animateStreaks: !paused },
    setConsolePlaying: () => undefined,
    setSunStudySelected: () => undefined,
    solar,
    sunStudySelected: [],
    tab,
    walk: { eyeM: 1.6, radiusM: 200, clickCount: 0, sampleCount: 0, lengthM: 0, speed: 1, status: "idle", drawing: false },
    walkAt: { index: 0, distanceM: 0 },
    windSettings,
    windPlan: { active: false },
  } as unknown as ModelPageViewModel;
  return <ModelPageViewportFooter vm={vm} />;
}

function SolarFooter({ onSolar }: { onSolar: (next: SolarViewSettings) => void }) {
  return <Footer onSolar={onSolar} initialKind="solar" />;
}

function modeButton(name: string) {
  const modes = screen.getByRole("group", { name: "Analysis modes" });
  return within(modes).getByRole("button", { name });
}

describe("Solar Study console", () => {
  afterEach(cleanup);

  it("puts a Sun hours pill between Shadows and 3D Sun Dome, off by default, and toggles it", () => {
    const calls: SolarViewSettings[] = [];
    render(<SolarFooter onSolar={(next) => calls.push(next)} />);
    const chips = screen.getByRole("group", { name: "Scene overlay toggles" });
    const labels = Array.from(chips.querySelectorAll("button.ov-chip")).map((b) => b.textContent);
    expect(labels).toEqual(["Shadows", "Sun hours", "3D Sun Dome"]);
    const pill = screen.getByRole("button", { name: "Sun hours" });
    expect(pill.getAttribute("aria-pressed")).toBe("false");
    expect(pill.className).toBe("ov-chip");
    fireEvent.click(pill);
    expect(calls.at(-1)?.sunHours).toBe(true);
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(pill.className).toBe("ov-chip on");
    fireEvent.click(pill);
    expect(calls.at(-1)?.sunHours).toBe(false);
    expect(document.querySelectorAll("[data-sun-hours-ground-chip]")).toHaveLength(1);
  });

  it("keeps the High/Fast switch and never shows an inline sun dome key in the Analysis bar", () => {
    render(<SolarFooter onSolar={() => undefined} />);
    const dome = screen.getByRole("button", { name: "3D Sun Dome" });
    if (dome.getAttribute("aria-pressed") !== "true") fireEvent.click(dome);
    expect(dome.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("list", { name: "Sun dome key" })).toBeNull();
    expect(document.querySelector(".sun-dome-key")).toBeNull();
    expect(screen.queryByText("Hours")).toBeNull();
    expect(screen.getByRole("group", { name: "Render quality" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "High render quality" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fast render quality" })).toBeTruthy();
  });

  it("does not show a sun dome key when Solar Study is off", () => {
    render(<Footer />);
    expect(screen.queryByRole("list", { name: "Sun dome key" })).toBeNull();
    expect(document.querySelector(".sun-dome-key")).toBeNull();
  });

  it("runs the time slider from 06:00 to 20:00 with 06 and 20 ticks and keeps the sunrise and sunset marks", () => {
    render(<SolarFooter onSolar={() => undefined} />);
    const slider = screen.getByRole("slider", { name: "Solar time of day" }) as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(["360", "1200"]);
    expect(screen.getByRole("button", { name: "Solar time 06:00" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Solar time 20:00" })).toBeTruthy();
    expect(screen.getByTitle("Melbourne sunrise").textContent).toContain("07:36");
    expect(screen.getByTitle("Melbourne sunset").textContent).toContain("17:06");
    fireEvent.change(slider, { target: { value: "1200" } });
    expect(screen.getByText(/20:00 AEST/)).toBeTruthy();
  });
});

describe("Analysis bar", () => {
  afterEach(cleanup);

  it("shows the full Solar Study layout on a new cut with all analyses off", () => {
    render(<Footer />);
    const bar = screen.getByRole("region", { name: "Environmental analysis console" });
    expect(bar.getAttribute("data-analysis")).toBe("none");
    expect(within(bar).getByText("Analysis")).toBeTruthy();
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) {
      expect(modeButton(name).getAttribute("aria-pressed")).toBe("false");
    }
    expect(within(bar).getByLabelText("Live solar telemetry").textContent).toContain("ALT");
    const chips = screen.getByRole("group", { name: "Scene overlay toggles" });
    expect(Array.from(chips.querySelectorAll("button.ov-chip")).map((b) => b.textContent)).toEqual([
      "Shadows",
      "Sun hours",
      "3D Sun Dome",
    ]);
    expect(screen.getByRole("group", { name: "Solar date presets" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Solar time of day" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Render quality" })).toBeTruthy();
    const idle = bar.querySelectorAll(".env-solar-idle");
    expect(idle.length).toBeGreaterThanOrEqual(2);
    for (const node of idle) {
      expect(node.hasAttribute("inert")).toBe(true);
    }
  });

  it("shows a High/Fast quality switch that changes the render quality", () => {
    render(<Footer />);
    const group = screen.getByRole("group", { name: "Render quality" });
    const high = within(group).getByRole("button", { name: "High render quality" });
    const fast = within(group).getByRole("button", { name: "Fast render quality" });
    expect(high.getAttribute("aria-pressed")).toBe("true");
    expect(fast.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(fast);
    expect(high.getAttribute("aria-pressed")).toBe("false");
    expect(fast.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(high);
    expect(high.getAttribute("aria-pressed")).toBe("true");
  });

  it("has no Walk Ripple mode", () => {
    render(<Footer />);
    const modes = screen.getByRole("group", { name: "Analysis modes" });
    expect(within(modes).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Solar Study",
      "Wind Rose",
      "Viewshed Walk",
    ]);
    expect(screen.queryByText(/Walk Ripple/)).toBeNull();
  });

  it("toggles each analysis on its own: clicking one never turns another off", () => {
    render(<Footer />);
    const bar = screen.getByRole("region", { name: "Environmental analysis console" });
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Wind Rose"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("Wind Rose").getAttribute("aria-pressed")).toBe("true");
    expect(bar.getAttribute("data-analysis")).toBe("solar wind");
    expect(bar.className).toContain("is-combined");
    fireEvent.click(modeButton("Viewshed Walk"));
    expect(bar.getAttribute("data-analysis")).toBe("solar wind view");
    for (const name of ["Solar Study", "Wind Rose", "Viewshed Walk"]) fireEvent.click(modeButton(name));
    expect(bar.getAttribute("data-analysis")).toBe("none");
    expect(bar.className).not.toContain("is-combined");
  });

  it("keeps the bar up with muted solar chrome when Solar Study and Wind Rose are both turned off again", () => {
    render(<Footer />);
    const bar = screen.getByRole("region", { name: "Environmental analysis console" });
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Wind Rose"));
    expect(bar.querySelectorAll(".env-solar-idle")).toHaveLength(0);
    fireEvent.click(modeButton("Solar Study"));
    expect(bar.querySelector(".env-solar-chrome")).toBeNull();
    fireEvent.click(modeButton("Wind Rose"));
    expect(screen.getByRole("region", { name: "Environmental analysis console" })).toBe(bar);
    const idle = bar.querySelectorAll(".env-solar-idle");
    expect(idle.length).toBeGreaterThanOrEqual(2);
    for (const node of idle) expect(node.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("group", { name: "Wind season presets" })).toBeNull();
  });

  it("keeps the solar rows and adds the wind row when Solar Study and Wind Rose are both on", () => {
    render(<Footer />);
    const bar = screen.getByRole("region", { name: "Environmental analysis console" });
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Wind Rose"));
    expect(Array.from(bar.children).map((row) => row.className)).toEqual([
      "env-top-row",
      "env-bottom-row env-solar-row",
      "env-bottom-row env-wind-row",
    ]);
    const top = bar.querySelector(".env-top-row")!;
    expect(top.lastElementChild?.getAttribute("aria-label")).toBe("Render quality");
    expect(top.querySelector(".env-top-main .env-quality")).toBeNull();
    expect(within(bar).queryByLabelText("Live wind telemetry")).toBeNull();
    expect(screen.getByRole("slider", { name: "Solar time of day" })).toBeTruthy();
    expect(bar.querySelector(".env-solar-row .time-readout-pill")?.textContent).toContain("15:00 AEST");
    const windRow = bar.querySelector(".env-wind-row")!;
    expect(windRow.querySelector(".time-readout-pill")).toBeNull();
    const end = windRow.lastElementChild!;
    expect(end.className).toBe("env-wind-end");
    expect(Array.from(end.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "3D Wind Flow",
      "Wind streaks",
      "❚❚ Pause",
    ]);
  });

  it("keeps solar-only and wind-only on two rows", () => {
    render(<Footer />);
    const bar = screen.getByRole("region", { name: "Environmental analysis console" });
    const rows = () => Array.from(bar.children).map((row) => row.className);
    expect(rows()).toEqual(["env-top-row", "env-bottom-row env-solar-row"]);
    fireEvent.click(modeButton("Solar Study"));
    expect(rows()).toEqual(["env-top-row", "env-bottom-row env-solar-row"]);
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Wind Rose"));
    expect(rows()).toEqual(["env-top-row", "env-bottom-row env-wind-row"]);
    expect(within(bar).getByLabelText("Live wind telemetry").textContent).toContain("PREVAILING");
    expect(bar.className).not.toContain("is-combined");
  });

  it("gives Wind Rose two separate chips, both on by default, that switch independently", () => {
    const winds: WindViewSettings[] = [];
    render(<Footer onWind={(next) => winds.push(next)} />);
    fireEvent.click(modeButton("Wind Rose"));
    const flow = () => screen.getByRole("button", { name: "3D Wind Flow" });
    const streaks = () => screen.getByRole("button", { name: "Wind streaks" });
    expect(flow().getAttribute("aria-pressed")).toBe("true");
    expect(streaks().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(flow());
    expect(winds.at(-1)?.enabled).toBe(false);
    expect(flow().getAttribute("aria-pressed")).toBe("false");
    expect(streaks().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(flow());
    fireEvent.click(streaks());
    expect(flow().getAttribute("aria-pressed")).toBe("true");
    expect(streaks().getAttribute("aria-pressed")).toBe("false");
    expect(winds.at(-1)?.enabled).toBe(true);
  });

  it("pauses and plays the wind animation from the end of the wind row, starting paused under reduced motion", () => {
    render(<Footer />);
    fireEvent.click(modeButton("Wind Rose"));
    const pause = screen.getByRole("button", { name: "Pause wind animation" });
    expect(pause.getAttribute("data-wind-paused")).toBe("false");
    fireEvent.click(pause);
    const play = screen.getByRole("button", { name: "Play wind animation" });
    expect(play.getAttribute("data-wind-paused")).toBe("true");
    expect(play.textContent).toBe("▶ Play");
    fireEvent.click(play);
    expect(screen.getByRole("button", { name: "Pause wind animation" })).toBeTruthy();
    cleanup();
    render(<Footer reducedMotion />);
    fireEvent.click(modeButton("Wind Rose"));
    const held = screen.getByRole("button", { name: "Play wind animation" });
    expect(held.getAttribute("data-wind-paused")).toBe("true");
    fireEvent.click(held);
    expect(screen.getByRole("button", { name: "Pause wind animation" })).toBeTruthy();
  });

  it("fills the selected date and season with ink, not yellow", () => {
    const css = readFileSync(resolve(__dirname, "../../floating.css"), "utf8");
    const active = css.match(/^\.model \.bottom-bar\.env-console \.p-pill\.active \{([^}]*)\}/m)?.[1] ?? "";
    expect(active).toContain("background: var(--ink)");
    expect(active).toContain("color: var(--on-ink)");
    expect(active).not.toContain("--accent");
    expect(readFileSync(resolve(__dirname, "../../theme.css"), "utf8")).toMatch(/--on-ink: #FFFFFF;/);
  });

  it("turns wind on with Wind Rose, off when Wind Rose is turned off, and leaves it on when Solar Study is clicked", () => {
    const winds: WindViewSettings[] = [];
    render(<Footer onWind={(next) => winds.push(next)} />);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(true);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(false);
    fireEvent.click(modeButton("Wind Rose"));
    const before = winds.length;
    fireEvent.click(modeButton("Solar Study"));
    expect(winds.length).toBe(before);
    expect(winds.at(-1)?.enabled).toBe(true);
    fireEvent.click(modeButton("Solar Study"));
    expect(winds.at(-1)?.enabled).toBe(true);
    expect(modeButton("Wind Rose").getAttribute("aria-pressed")).toBe("true");
  });

  it("turns Shadows and the 3D Sun Dome on when Solar Study is clicked, leaving Sun hours off", () => {
    const calls: SolarViewSettings[] = [];
    render(<Footer onSolar={(next) => calls.push(next)} />);
    expect(screen.getByRole("button", { name: "Shadows" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "3D Sun Dome" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(modeButton("Solar Study"));
    expect(calls.at(-1)).toMatchObject({ castShadows: true, showPath: true, sunHours: false });
    expect(screen.getByRole("button", { name: "Shadows" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3D Sun Dome" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sun hours" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("turns Shadows and the 3D Sun Dome on when Solar Study is added to Wind Rose or Viewshed Walk", () => {
    for (const from of ["Wind Rose", "Viewshed Walk"]) {
      const calls: SolarViewSettings[] = [];
      render(<Footer onSolar={(next) => calls.push(next)} />);
      fireEvent.click(modeButton(from));
      expect(calls).toEqual([]);
      fireEvent.click(modeButton("Solar Study"));
      expect(calls.at(-1)).toMatchObject({ castShadows: true, showPath: true });
      cleanup();
    }
  });

  it("lets Shadows and the dome be turned off during Solar Study, keeps them as left when it is turned off, and turns both back on at the next click", () => {
    const calls: SolarViewSettings[] = [];
    render(<Footer onSolar={(next) => calls.push(next)} />);
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(screen.getByRole("button", { name: "Shadows" }));
    fireEvent.click(screen.getByRole("button", { name: "3D Sun Dome" }));
    expect(calls.at(-1)).toMatchObject({ castShadows: false, showPath: false });
    const beforeOff = calls.length;
    fireEvent.click(modeButton("Solar Study"));
    expect(calls.length).toBe(beforeOff);
    fireEvent.click(modeButton("Solar Study"));
    expect(calls.at(-1)).toMatchObject({ castShadows: true, showPath: true });
  });

  it("labels the solstice date buttons with their names", () => {
    render(<Footer initialKind="solar" />);
    const dates = screen.getByRole("group", { name: "Solar date presets" });
    expect(within(dates).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "21 Jun · Winter solstice",
      "22 Sep · Equinox",
      "22 Dec · Summer solstice",
    ]);
    expect(screen.getByRole("button", { name: "21 Jun · Winter solstice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "22 Dec · Summer solstice" })).toBeTruthy();
  });

  it("keeps the 3D Sun Dome chip in Drawing with Shadows, Sun hours and the 9–3pm Plan Fan", () => {
    const calls: SolarViewSettings[] = [];
    render(<Footer initialKind="solar" tab="drawing" onSolar={(next) => calls.push(next)} />);
    const chips = screen.getByRole("group", { name: "Scene overlay toggles" });
    const labels = Array.from(chips.querySelectorAll("button.ov-chip")).map((b) => b.textContent);
    expect(labels).toEqual(["Shadows", "Sun hours", "3D Sun Dome", "9–3pm Plan Fan"]);
    fireEvent.click(screen.getByRole("button", { name: "3D Sun Dome" }));
    expect(calls.at(-1)?.showPath).toBe(true);
  });

  it("marks the active mode with the accent class and styles it as an accent mode chip", () => {
    render(<Footer initialKind="solar" />);
    expect(modeButton("Solar Study").className).toBe("env-mode-btn active");
    expect(modeButton("Wind Rose").className).toBe("env-mode-btn");
    const css = readFileSync(resolve(__dirname, "../../floating.css"), "utf8");
    const rule = (sel: string) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`, "m"))?.[1] ?? "";
    const active = rule(".model .bottom-bar.env-console .env-mode-btn.active");
    expect(active).toContain("background: var(--accent)");
    expect(active).toContain("inset 0 0 0 1px var(--ink)");
    expect(active).toContain("font-weight: 700");
    expect(rule(".model .bottom-bar.env-console .env-console-title")).toContain("font-size: var(--fs-micro)");
    expect(rule(".model .bottom-bar.env-console .p-pill")).toContain("white-space: nowrap");
    expect(rule(".model .bottom-bar.env-console .date-presets")).toContain("flex-shrink: 0");
  });

  it("stays hidden on Satellite", () => {
    render(<Footer initialKind="solar" tab="satellite" />);
    expect(screen.queryByRole("region", { name: "Environmental analysis console" })).toBeNull();
  });
});

describe("Sun hours layers follow the toggle", () => {
  it("only feeds the 3D heatmap and legend when Sun hours is on", () => {
    const tabs = readFileSync(resolve(__dirname, "ModelPageViewportTabs.tsx"), "utf8");
    expect(tabs).toContain("sunHoursGroundGrid={solar.sunHours ? sunHoursGround.grid : null}");
    expect(tabs).toContain("sunHoursDirectOverlay={solar.sunHours ? sunHoursGround.overlay : null}");
    expect(tabs).not.toContain("SunHoursLegendDock");
    const sidebar = readFileSync(resolve(__dirname, "ModelPageSidebar.tsx"), "utf8");
    expect(sidebar).toContain("sunHours: Boolean(vm.solar.sunHours)");
    expect(sidebar).toContain("{sunHoursLegendOn ? <SunHoursLegendDock sunHoursGround={vm.sunHoursGround} /> : null}");
    expect(tabs).toContain("solarAnalysisActive={solarStudyViewActive(analyses)}");
    expect(tabs).not.toContain("analysisKind");
  });
});
