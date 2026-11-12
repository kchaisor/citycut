import { describe, expect, it } from "vitest";
import { bakeGroundWindGlyphTexture, bakeGroundWindHaloTexture } from "./groundWindGlyph";

describe("ground wind glyph", () => {
  it("bakes lozenge and halo textures for instanced flow", () => {
    const glyph = bakeGroundWindGlyphTexture();
    const halo = bakeGroundWindHaloTexture();
    expect(glyph.image.width).toBeGreaterThan(0);
    expect(halo.image.height).toBeGreaterThan(0);
    glyph.dispose();
    halo.dispose();
  });
});
