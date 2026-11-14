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
    const pick = page.match(/onSceneInspectPick=\{[\s\S]*?\}/)?.[0] ?? "";
    const clear = page.match(/onClearSceneInspect=\{[\s\S]*?\}/)?.[0] ?? "";
    expect(pick).toContain("setSceneSelection");
    expect(pick).not.toContain("setSnapId");
    expect(pick).not.toContain("commitView");
    expect(clear).toContain("setSceneSelection(null)");
    expect(clear).not.toContain("setSnapId");
  });

  it("renders the inspect HUD as a floating panel positioned with inspectHudLayout", () => {
    const page = readFileSync(`${srcRoot}/components/ModelPage.tsx`, "utf8");
    expect(page).toContain("clampInspectHudPosition");
    expect(page).toContain("InspectHudProjector");
    const css = readFileSync(`${srcRoot}/index.css`, "utf8");
    expect(css).toMatch(/\.building-detail-panel\.is-floating/);
    expect(css).not.toMatch(/\.building-detail-panel\s*\{[^}]*top:\s*0;/);
    expect(css).not.toMatch(/\.building-detail-panel\s*\{[^}]*right:\s*0;/);
  });
});
