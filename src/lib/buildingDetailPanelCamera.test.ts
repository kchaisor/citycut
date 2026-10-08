import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

describe("building detail panel camera unchanged", () => {
  it("does not tie height-edit selection to viewport camera refit", () => {
    const scene = readFileSync(`${srcRoot}/components/Scene3D.tsx`, "utf8");
    expect(scene).not.toMatch(/heightEditBuildingId[\s\S]{0,400}setSnapId/);
    expect(scene).not.toMatch(/heightEditBuildingId[\s\S]{0,400}fitId/);
  });

  it("updates selection state without moving the camera on pick or clear", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    const pick = page.match(/onBuildingPick=\{[\s\S]*?\}/)?.[0] ?? "";
    const clear = page.match(/onClearBuildingPick=\{[\s\S]*?\}/)?.[0] ?? "";
    expect(pick).toContain("setHeightPick");
    expect(pick).not.toContain("setSnapId");
    expect(pick).not.toContain("commitView");
    expect(clear).toContain("setHeightPick(null)");
    expect(clear).not.toContain("setSnapId");
  });

  it("renders the building detail panel as a fixed right dock", () => {
    const css = readFileSync(`${srcRoot}/index.css`, "utf8");
    expect(css).toContain(".building-detail-panel");
    expect(css).toMatch(/\.building-detail-panel[\s\S]*top:\s*56px/);
    expect(css).toMatch(/width:\s*340px/);
  });
});
