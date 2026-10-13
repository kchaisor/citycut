// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import { SelectChrome } from "./components/SelectChrome";
import {
  getSidebarCollapsed,
  resetSidebarCollapsedForTests,
  setSidebarCollapsed,
  SIDEBAR_COLLAPSED_KEY,
} from "./lib/sidebarCollapse";

const { stageProps } = vi.hoisted(() => ({ stageProps: [] as Record<string, unknown>[] }));

vi.mock("./components/MapStage", () => ({
  MapStage: (props: Record<string, unknown>) => {
    stageProps.push(props);
    return <div className="map-wrap" data-testid="map" />;
  },
}));
vi.mock("./components/ModelPage", () => ({ ModelPage: () => <div className="model" /> }));

function camera(props: Record<string, unknown>) {
  return JSON.stringify({
    initialView: props.initialView,
    fly: props.fly,
  });
}

function setNarrow(narrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  resetSidebarCollapsedForTests();
  stageProps.length = 0;
  setNarrow(false);
});
afterEach(() => cleanup());

describe("landing sidebar", () => {
  it("never changes the map's size or camera when switching sections or flipping toggles", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppRoot />);
    const select = container.querySelector(".select")!;
    const sizeClass = select.className;
    const before = camera(stageProps[stageProps.length - 1]);
    const rail = screen.getByRole("toolbar", { name: "Model tools" });
    for (const name of ["Cut", "Layers", "Place", "Layers"]) {
      await user.click(within(rail).getByRole("button", { name: new RegExp(`^${name}$`) }));
      expect(select.className).toBe(sizeClass);
      expect(camera(stageProps[stageProps.length - 1])).toBe(before);
    }
    const panel = container.querySelector("#select-drawer")!;
    for (const toggle of panel.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")) {
      await user.click(toggle);
      await user.click(toggle);
      expect(select.className).toBe(sizeClass);
    }
    // Section switches and layer toggles never touch the camera.
    await user.click(within(rail).getByRole("button", { name: /^Layers$/ }));
    for (const toggle of container.querySelectorAll<HTMLButtonElement>(".layers button.toggle")) {
      await user.click(toggle);
    }
    expect(camera(stageProps[stageProps.length - 1])).toBe(before);
    expect(select.className).toBe(sizeClass);
  });

  it("keeps the map's width fixed for every section in CSS", () => {
    const css = readFileSync(resolve(__dirname, "index.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // The only rules that set the landing sidebar's width or height key off the collapse
    // class, never off the open section, so the map beside it keeps one size.
    const selectors = [...css.matchAll(/([^{};]+)\{\s*--sidebar-[wh]:/g)].map((m) => m[1].trim());
    const landing = new Set(selectors.filter((s) => s.includes(".select")));
    expect([...landing].sort()).toEqual([".select", ".select.sidebar-collapsed"]);
  });

  it("starts collapsed on mobile so the cut frame fits", () => {
    setNarrow(true);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "0");
    const { container } = render(<AppRoot />);
    expect(container.querySelector(".select")!.className).toContain("sidebar-collapsed");
    expect(container.querySelector<HTMLElement>("#select-drawer")!.hidden).toBe(true);
  });

  it("starts open on desktop and honours a stored collapse", () => {
    expect(getSidebarCollapsed()).toBe(false);
    resetSidebarCollapsedForTests();
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    expect(getSidebarCollapsed()).toBe(true);
  });

  it("shares one collapse setting between the landing and model pages", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppRoot />);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(getSidebarCollapsed()).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(container.querySelector(".select")!.className).toContain("sidebar-collapsed");
    // The model page reads the same store, so a change there reaches the landing page.
    act(() => setSidebarCollapsed(false));
    expect(container.querySelector(".select")!.className).not.toContain("sidebar-collapsed");
  });

  it("shows build errors in the footer next to Create model", () => {
    const { container } = render(
      <SelectChrome
        placeLabel="East Melbourne"
        sideKm={1}
        layers={{ buildings: true, roads: true, terrain: true, contours: true, waterGreen: true, trees: true, satellite: false }}
        loading={false}
        error="Could not build the model."
        onSideKm={() => undefined}
        frameShape="square"
        onFrameShape={() => undefined}
        onLayer={() => undefined}
        onPlace={() => undefined}
        onCreate={() => undefined}
        basemap="map"
        onBasemap={() => undefined}
        center={{ lat: -37.8127, lon: 144.98061 }}
        onHome={() => undefined}
      />,
    );
    const foot = container.querySelector(".sidebar-foot")!;
    expect(within(foot as HTMLElement).getByRole("alert").textContent).toBe("Could not build the model.");
    expect(within(foot as HTMLElement).getByRole("button", { name: /Create model/ })).toBeTruthy();
    expect(screen.getByText("-37.81270, 144.98061", { exact: false })).toBeTruthy();
  });
});
