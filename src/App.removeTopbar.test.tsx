// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import { resetSidebarCollapsedForTests } from "./lib/sidebarCollapse";

const { stageProps } = vi.hoisted(() => ({ stageProps: [] as Record<string, unknown>[] }));

vi.mock("./components/MapStage", () => ({
  MapStage: (props: Record<string, unknown>) => {
    stageProps.push(props);
    return <div className="map-wrap" data-testid="map" />;
  },
}));
vi.mock("./components/ModelPage", () => ({ ModelPage: () => <div className="model" /> }));

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

describe("remove top bar", () => {
  it("renders the sidebar brand bar and no top bar on the landing page", () => {
    const { container } = render(<AppRoot />);
    expect(container.querySelector(".topbar")).toBeNull();
    expect(container.querySelector(".sidebar-brand-bar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "CityCut home" })).toBeTruthy();
    expect(container.querySelector(".app")?.children[0]?.className).toContain("select");
  });

  it("keeps the map and model viewport fill starting at top 0 in CSS", () => {
    const css = readFileSync(resolve(__dirname, "index.css"), "utf8");
    expect(css).not.toMatch(/\.topbar\s*\{/);
    expect(css).toMatch(/\.sidebar-brand-bar\s*\{[^}]*height:\s*56px/);
    expect(css).toMatch(/\.map-wrap\s*\{\s*position:\s*absolute;\s*inset:\s*0;/);
    expect(css).toMatch(/\.fill\s*\{\s*position:\s*absolute;\s*inset:\s*0;/);
    const fillOverride = [...css.matchAll(/\.model \.viewport > \.fill\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(fillOverride.length).toBeGreaterThan(0);
    for (const body of fillOverride) {
      expect(body).not.toMatch(/(^|;)\s*top\s*:/);
    }
    const mapOverride = [...css.matchAll(/\.select > \.map-wrap\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(mapOverride.length).toBeGreaterThan(0);
    for (const body of mapOverride) {
      expect(body).not.toMatch(/(^|;)\s*top\s*:/);
    }
    expect(css).toMatch(/\.building-detail-panel\s*\{[^}]*top:\s*0;/);
  });

  it("does not ship TopBar.tsx", () => {
    const missing = () => readFileSync(resolve(__dirname, "components/TopBar.tsx"), "utf8");
    expect(missing).toThrow();
  });
});
