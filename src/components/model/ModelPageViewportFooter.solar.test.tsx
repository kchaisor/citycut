// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveAnalysis } from "../../lib/sidebarSections";
import { DEFAULT_WIND_SETTINGS, type WindViewSettings } from "../../lib/windState";
import type { SolarViewSettings } from "../SolarHeliodon";
import { initialSolarSettings } from "./initialSolarSettings";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import type { ModelPageViewModel } from "./useModelPage";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

type FooterProps = {
  onSolar?: (next: SolarViewSettings) => void;
  onWind?: (next: WindViewSettings) => void;
  initialKind?: ActiveAnalysis;
  tab?: "3d" | "drawing" | "satellite";
};

function Footer({ onSolar = () => undefined, onWind = () => undefined, initialKind = null, tab = "3d" }: FooterProps) {
  const [solar, setSolar] = useState(() => initialSolarSettings("", emptyStorage));
  const [analysisKind, setAnalysisKind] = useState<ActiveAnalysis>(initialKind);
  const [windSettings, setWindSettings] = useState<WindViewSettings>(DEFAULT_WIND_SETTINGS);
  const [renderQuality, setRenderQuality] = useState<"high" | "fast">("high");
  const vm = {
    analysisKind,
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
    setAnalysisKind,
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

  it("turns the active analysis off when clicked again and switches when another is clicked", () => {
    render(<Footer />);
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(modeButton("Solar Study"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(modeButton("Solar Study"));
    fireEvent.click(modeButton("Viewshed Walk"));
    expect(modeButton("Solar Study").getAttribute("aria-pressed")).toBe("false");
    expect(modeButton("Viewshed Walk").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(modeButton("Viewshed Walk"));
    expect(screen.getByRole("region", { name: "Environmental analysis console" }).getAttribute("data-analysis")).toBe("none");
  });

  it("turns wind on with Wind Rose and off again when Wind Rose is turned off or left", () => {
    const winds: WindViewSettings[] = [];
    render(<Footer onWind={(next) => winds.push(next)} />);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(true);
    fireEvent.click(modeButton("Wind Rose"));
    expect(winds.at(-1)?.enabled).toBe(false);
    fireEvent.click(modeButton("Wind Rose"));
    fireEvent.click(modeButton("Solar Study"));
    expect(winds.at(-1)?.enabled).toBe(false);
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
    expect(tabs).toMatch(
      /tab === "3d" && solar\.sunHours \? \(\s*<SunHoursLegendDock stackClassName="sun-hours-direct-dock-stack"/,
    );
    expect(tabs).toContain("solarAnalysisActive={solarStudyViewActive(analysisKind)}");
    expect(tabs).not.toContain('solarAnalysisActive={analysisKind === "solar"}');
  });
});
