import { describe, expect, it } from "vitest";
import { exportTiles, ILLUSTRATOR_DISABLED_TOOLTIP, PNG_DISABLED_TOOLTIP, SVG_DISABLED_TOOLTIP, type ExportTileInput } from "./exportTiles";

const base: ExportTileInput = {
  tab: "3d",
  drawing: "site",
  busy: null,
  figureScale: 2500,
  sunStudyDate: "22 Sep 2026",
  buildingsAsMesh: false,
  crsName: "GDA2020 / MGA zone 55",
};

const byId = (input: ExportTileInput) => Object.fromEntries(exportTiles(input).map((t) => [t.id, t]));

describe("export tiles", () => {
  it("lists only today's formats, as app name + extension", () => {
    expect(exportTiles(base).map((t) => `${t.app} ${t.ext}`)).toEqual(["Rhino 5+ .3dm", "Illustrator .ai", "SVG .svg", "Sun study .zip", "Image .png"]);
  });

  it("disables Illustrator off the vector views, with the reason as its tooltip", () => {
    for (const tab of ["3d", "satellite"] as const) {
      const ai = byId({ ...base, tab }).ai!;
      expect(ai.enabled).toBe(false);
      expect(ai.disabledReason).toBe(ILLUSTRATOR_DISABLED_TOOLTIP);
    }
  });

  it("routes Illustrator to the current drawing and keeps the old download labels", () => {
    expect(byId({ ...base, tab: "drawing", drawing: "site" }).ai!.ariaLabel).toBe("Download site plan Illustrator");
    expect(byId({ ...base, tab: "drawing", drawing: "figure-ground" }).ai!.ariaLabel).toBe("Download figure-ground Illustrator");
    expect(byId({ ...base, tab: "drawing", drawing: "exploded-axo" }).ai!.ariaLabel).toBe("Download exploded axo Illustrator");
    expect(byId({ ...base, tab: "drawing", drawing: "isometric" }).ai!.ariaLabel).toBe("Download isometric Illustrator");
    expect(byId({ ...base, tab: "drawing" }).ai!.enabled).toBe(true);
    expect(byId({ ...base, tab: "drawing" }).ai!.description).toContain("1:2500");
  });

  it("enables PNG on the 3D tab only", () => {
    expect(byId(base).png!.enabled).toBe(true);
    expect(byId({ ...base, tab: "drawing" }).png!.disabledReason).toBe(PNG_DISABLED_TOOLTIP);
  });

  it("keeps Rhino and the sun study zip available on every tab, and blocks all while one is preparing", () => {
    for (const tab of ["3d", "drawing", "satellite"] as const) {
      const t = byId({ ...base, tab });
      expect(t["3dm"]!.enabled && t["sun-zip"]!.enabled).toBe(true);
    }
    const busy = byId({ ...base, tab: "drawing", busy: "ai-sun" });
    expect(Object.values(busy).every((t) => !t.enabled)).toBe(true);
    expect(busy["sun-zip"]!.busy).toBe(true);
    expect(byId({ ...base, buildingsAsMesh: true })["3dm"]!.description).toContain("meshes");
  });

  it("offers a layered SVG for the site plan, figure-ground, and isometric drawing", () => {
    expect(byId(base).svg.enabled).toBe(false);
    expect(byId(base).svg.disabledReason).toBe(SVG_DISABLED_TOOLTIP);
    const site = byId({ ...base, tab: "drawing", drawing: "site" }).svg;
    expect([site.enabled, site.ariaLabel]).toEqual([true, "Download site plan SVG"]);
    const figure = byId({ ...base, tab: "drawing", drawing: "figure-ground" }).svg;
    expect([figure.enabled, figure.ariaLabel]).toEqual([true, "Download figure-ground SVG"]);
    const iso = byId({ ...base, tab: "drawing", drawing: "isometric" }).svg;
    expect([iso.enabled, iso.ariaLabel]).toEqual([true, "Download isometric SVG"]);
    expect(byId({ ...base, tab: "drawing", drawing: "exploded-axo" }).svg.enabled).toBe(false);
    expect(byId({ ...base, tab: "drawing", busy: "svg-site" }).svg.busy).toBe(true);
    expect(byId({ ...base, tab: "drawing", drawing: "isometric", busy: "svg-isometric" }).svg.busy).toBe(true);
  });

  it("says the site plan .ai and .svg carry hourly layers while the sun study is on", () => {
    const on = byId({ ...base, tab: "drawing", drawing: "site", sunStudy: true });
    expect(on.ai.description).toContain("one layer per hour 9am–3pm");
    expect(on.svg.description).toContain("one layer per hour 9am–3pm");
    expect(byId({ ...base, tab: "drawing", drawing: "site" }).ai.description).not.toContain("per hour");
    expect(byId({ ...base, tab: "drawing", drawing: "figure-ground", sunStudy: true }).ai.description).not.toContain("per hour");
  });
});
