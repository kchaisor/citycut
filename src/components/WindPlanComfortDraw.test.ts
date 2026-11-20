import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { windPlanLineStyle } from "../lib/windPlanStyle";
import { COMFORT_CLASSES } from "../lib/windComfort";
import { COMFORT_SWATCH } from "./WindPlanCard";

const overlay = readFileSync(path.join(process.cwd(), "src/components/WindPlanOverlay.tsx"), "utf8");
const drawingCss = readFileSync(path.join(process.cwd(), "src/drawing-style.css"), "utf8");
const theme = readFileSync(path.join(process.cwd(), "THEME.md"), "utf8");

describe("plan comfort map drawing", () => {
  it("clips to the site but never strokes the red site boundary", () => {
    expect(overlay).not.toContain("--site-boundary");
    expect(overlay).not.toContain("strokeSiteBoundary");
    expect(overlay).toContain("windPlanSiteClip(model)");
    expect(overlay).toContain('ctx.clip(site.path, "evenodd");');
  });

  it("draws comfort cell by cell from the Lawson class of each sampled pixel", () => {
    expect(overlay).toContain("lawsonClass({");
    expect(overlay).toContain("ctx.drawImage(comfortImage(comfort, colourRevision), originE, originN, gridW, gridH);");
    expect(overlay).not.toContain("featherEdge");
  });

  it("paints water in its own colour over both plan maps", () => {
    expect(overlay.split('ctx.fillStyle = getColour("--wind-plan-water");').length - 1).toBeGreaterThanOrEqual(2);
  });

  it("draws small unsafe patches as smaller, lighter hatched marks", () => {
    const style = windPlanLineStyle(() => "");
    expect(style.unsafeMinPx).toBeLessThan(12);
    expect(style.unsafeMinPx).toBeGreaterThan(0);
    expect(style.unsafeMark.px).toBeLessThan(style.unsafeOutline.px);
    expect(style.unsafeMark.opacity).toBeLessThan(1);
    expect(style.unsafeMark.colour).toBe(style.unsafeOutline.colour);
    expect(overlay).toContain("hatch(ctx, rect.width, rect.height, style, dpr, style.unsafeMark.opacity);");
    expect(overlay).toContain("strokePen(ctx, disc, style.unsafeMark, scale);");
  });

  it("keeps unsafe as a hatch flag, not a sixth fill colour", () => {
    expect(COMFORT_CLASSES).toHaveLength(5);
    expect(Object.values(COMFORT_SWATCH)).not.toContain("--wind-plan-unsafe-stroke");
    expect(overlay).not.toMatch(/--wind-plan-unsafe[a-z-]*"\)\s*;\s*\n\s*ctx\.fill\(/);
  });

  it("documents every new comfort token in THEME.md", () => {
    for (const token of [
      "--wind-plan-unsafe-min-px",
      "--wind-plan-unsafe-mark-px",
      "--wind-plan-unsafe-mark-opacity",
    ]) {
      expect(drawingCss).toContain(`${token}:`);
      expect(theme).toContain(`\`${token}\``);
    }
  });
});
