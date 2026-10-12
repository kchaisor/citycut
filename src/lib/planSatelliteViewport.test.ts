import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planViewportExtent } from "./planViewport";
import { planViewportFromLngLatBounds, planViewportLngLatBounds } from "./planSatelliteViewport";
import { toLocal } from "./geo";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));
const center = { lat: -37.8136, lon: 144.9631 };

describe("plan satellite viewport mapping", () => {
  it("round-trips site plan extent through lng/lat bounds", () => {
    const view = planViewportExtent(2000);
    const bounds = planViewportLngLatBounds(view, center);
    const back = planViewportFromLngLatBounds(bounds, center);
    expect(back.x).toBeCloseTo(view.x, 4);
    expect(back.y).toBeCloseTo(view.y, 4);
    expect(back.w).toBeCloseTo(view.w, 4);
    expect(back.h).toBeCloseTo(view.h, 4);
  });

  it("keeps north up: the plan's Y grows south, so the map centre matches the viewBox centre", () => {
    const view = planViewportExtent(1000);
    const [[west, south], [east, north]] = planViewportLngLatBounds(view, center);
    expect(south).toBeLessThan(north);
    expect(west).toBeLessThan(east);
    const mid = toLocal((south + north) / 2, (west + east) / 2, center);
    expect(mid[0]).toBeCloseTo(view.x + view.w / 2, 3);
    expect(mid[1]).toBeCloseTo(-(view.y + view.h / 2), 3);
    // Panning the plan 100 m north (viewBox y decreases) moves the map 100 m north too.
    const panned = planViewportLngLatBounds({ ...view, y: view.y - 100 }, center);
    const pannedMid = toLocal((panned[0][1] + panned[1][1]) / 2, (panned[0][0] + panned[1][0]) / 2, center);
    expect(pannedMid[1] - mid[1]).toBeCloseTo(100, 3);
  });

  it("uses the same default extent for site plan and figure ground", () => {
    const site = planViewportExtent(1500);
    const figure = planViewportExtent(1500);
    expect(site).toEqual(figure);
    expect(planViewportLngLatBounds(site, center)).toEqual(planViewportLngLatBounds(figure, center));
  });
});

describe("satellite tab viewport unchanged", () => {
  it("does not refit the 3D camera when switching model tabs", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    expect(page).not.toMatch(/setTab\([\s\S]{0,120}setSnapId/);
    const setTabHandler = page.match(/onClick=\{\(\) => setTab\(id\)\}/)?.[0] ?? "";
    expect(setTabHandler).not.toContain("setSnapId");
  });

  it("does not change plan viewport when toggling site plan vs figure ground", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    const siteBtn = page.match(/setDrawing\("site"\)[\s\S]{0,80}/)?.[0] ?? "";
    const fgBtn = page.match(/setDrawing\("figure-ground"\)[\s\S]{0,80}/)?.[0] ?? "";
    expect(siteBtn).not.toContain("setPlanViewport");
    expect(fgBtn).not.toContain("setPlanViewport");
    expect(siteBtn).not.toContain("setFitCounter");
    expect(fgBtn).not.toContain("setFitCounter");
  });
});
