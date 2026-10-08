import { describe, expect, it, vi } from "vitest";
import { buildHeightSourceLoadWarnings } from "./buildHeightSourceLoadWarnings";

const melbourneBounds = { west: 144.97, east: 144.99, south: -37.82, north: -37.8 };

describe("buildHeightSourceLoadWarnings", () => {
  it("warns when CoM fetch fails in Melbourne", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnings = buildHeightSourceLoadWarnings({
      buildingsLayer: true,
      comBounds: melbourneBounds,
      comError: "timeout",
      comFootprintCount: 0,
      damError: null,
    });
    expect(warnings).toContain("CoM 2023 heights didn't load. Showing estimates.");
  });

  it("warns when DAM fails", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnings = buildHeightSourceLoadWarnings({
      buildingsLayer: true,
      comBounds: melbourneBounds,
      comError: null,
      comFootprintCount: 100,
      damError: "network",
    });
    expect(warnings).toContain("CoM development floor records didn't load. Showing estimates.");
  });
});
