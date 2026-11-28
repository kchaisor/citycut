import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { massingBuildingColour, massingBuildingMeta } from "./massingBuildings";
import { qaSchemeMassing } from "./qaSchemeFixture";

const SRC = new URL("..", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const read = (relative: string) => readFileSync(join(SRC, relative), "utf8");

describe("imported models have no use type and no name tags", () => {
  const massing = qaSchemeMassing(0);

  it("gives every imported building use null, the imported white, and a meta line without a use name", () => {
    for (const building of massing.buildings) {
      expect(building.use).toBeNull();
      expect(massingBuildingColour(massing, building)).toBe(getColour("--imported-massing"));
      expect(massingBuildingMeta(building)).toMatch(/^\d+ m( · \d+ levels?)?$/);
    }
  });

  it("keeps use lookups out of the import code", () => {
    for (const file of ["lib/massingBuildings.ts", "lib/massingImport.ts", "lib/massingStore.ts", "components/ImportMassingPanel.tsx"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/buildingUse|BUILDING_USE_META|--use-|useFromLayerPath|useFromUserText|MassingBuildingUse/);
    }
  });

  it("has no use control in the imported building card", () => {
    const card = read("components/BuildingHeightPopover.tsx");
    const imported = card.slice(card.indexOf("export function ImportedBuildingPopover"), card.indexOf("export function HiddenBuildingsPanel"));
    expect(imported.length).toBeGreaterThan(0);
    expect(imported).not.toMatch(/onSetUse|Set use|Change use|massingUseLabel|<select/);
  });

  it("has no imported name-label code anywhere in the app", () => {
    const hits = sourceFiles(SRC).filter((file) => /ImportedLabel|importedLabels|ImportedNameLabel/.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });
});
