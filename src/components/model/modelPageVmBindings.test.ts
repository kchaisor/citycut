import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("model page vm bindings", () => {
  it("exposes sidebar and drawing controls on the view model return", () => {
    const hook = readFileSync(resolve(__dirname, "useModelPage.tsx"), "utf8");
    const returnBlock = hook.match(/return \{([\s\S]*?)\n  \};\n\}\n\nexport type ModelPageViewModel/)?.[1] ?? "";
    for (const key of [
      "effectiveSunStudyCasters",
      "writeStoredShowManualHeights",
      "showHiddenEntry",
      "showAllInCut",
      "AXO_LAYER_LABELS",
      "referenceExplodedAxoSettings",
      "defaultExplodedAxoSettings",
      "defaultExplodedAxoGapM",
      "explodedAxoBounds",
      "explodedAxoViewportExtent",
      "isometricDrawingBounds",
    ]) {
      expect(returnBlock, `useModelPage must return ${key}`).toMatch(new RegExp(`^\\s+${key},`, "m"));
    }
  });
});