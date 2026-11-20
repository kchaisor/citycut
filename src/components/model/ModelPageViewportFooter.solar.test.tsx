// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { SolarViewSettings } from "../SolarHeliodon";
import { initialSolarSettings } from "./initialSolarSettings";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import type { ModelPageViewModel } from "./useModelPage";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

function SolarFooter({ onSolar }: { onSolar: (next: SolarViewSettings) => void }) {
  const [solar, setSolar] = useState(() => initialSolarSettings("", emptyStorage));
  const vm = {
    analysisKind: "solar",
    commitSolar: (next: SolarViewSettings) => {
      onSolar(next);
      setSolar(next);
    },
    consoleDaylight: { sunrise: 456, sunset: 1026 },
    consolePlaying: false,
    consoleSun: { altitudeDeg: 12, azimuthDeg: 300 },
    drawing: "site",
    leftOpen: "analysis",
    model: { buildings: [] },
    setConsolePlaying: () => undefined,
    setSunStudySelected: () => undefined,
    solar,
    sunStudySelected: [],
    tab: "3d",
    walk: {},
    walkRipple: {},
    windSettings: {},
    windPlan: { active: false },
  } as unknown as ModelPageViewModel;
  return <ModelPageViewportFooter vm={vm} />;
}

describe("Solar Study console", () => {
  afterEach(cleanup);

  it("puts a Sun hours pill next to 3D Sun Dome and Shadows, off by default, and toggles it", () => {
    const calls: SolarViewSettings[] = [];
    render(<SolarFooter onSolar={(next) => calls.push(next)} />);
    const chips = screen.getByRole("group", { name: "Scene overlay toggles" });
    const labels = Array.from(chips.querySelectorAll("button.ov-chip")).map((b) => b.textContent);
    expect(labels).toEqual(["3D Sun Dome", "Shadows", "Sun hours"]);
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

describe("Sun hours layers follow the toggle", () => {
  it("only feeds the 3D heatmap and legend when Sun hours is on", () => {
    const tabs = readFileSync(resolve(__dirname, "ModelPageViewportTabs.tsx"), "utf8");
    expect(tabs).toContain("sunHoursGroundGrid={solar.sunHours ? sunHoursGround.grid : null}");
    expect(tabs).toContain("sunHoursDirectOverlay={solar.sunHours ? sunHoursGround.overlay : null}");
    expect(tabs).toMatch(
      /tab === "3d" && solar\.sunHours \? \(\s*<SunHoursLegendDock stackClassName="sun-hours-direct-dock-stack"/,
    );
    expect(tabs).toContain("solarAnalysisActive={solarStudyViewActive(leftOpen, analysisKind)}");
    expect(tabs).not.toContain('solarAnalysisActive={analysisKind === "solar"}');
  });
});
