import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { themeSheetColor } from "./drawingSheet";
import { HELIODON_BACKGROUND_KEY, heliodonPalette } from "./heliodonPalette";

describe("heliodon palette", () => {
  it("cases lines and haloes labels in the 3D background colour", () => {
    const palette = heliodonPalette();
    expect(palette.casing).toBe(themeSheetColor(HELIODON_BACKGROUND_KEY));
    expect(palette.halo).toBe(palette.casing);
  });

  it("uses the same background key as the 3D canvas", async () => {
    const scene = await readFile(fileURLToPath(new URL("../components/Scene3D.tsx", import.meta.url)), "utf8");
    expect(scene).toContain(`themeColor("${HELIODON_BACKGROUND_KEY}")`);
    expect(scene).toContain('<color attach="background" args={[modelBg]} />');
  });

  it("draws every heliodon halo and casing from the palette, not a fixed colour key", async () => {
    const source = await readFile(fileURLToPath(new URL("../components/SolarHeliodon.tsx", import.meta.url)), "utf8");
    expect(source).not.toContain("--sheet-fill");
    expect(source).toMatch(/halo: palette\.halo/);
    expect(source).toMatch(/palette\.casing/);
  });
});
