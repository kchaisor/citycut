import { describe, expect, it } from "vitest";
import { bakeGroundWindGlyphTexture } from "./groundWindGlyph";

describe("ground wind glyph", () => {
  it("bakes a streak texture for instanced glyphs", () => {
    const texture = bakeGroundWindGlyphTexture();
    expect(texture.image.width).toBeGreaterThan(0);
    expect(texture.image.height).toBeGreaterThan(0);
    texture.dispose();
  });
});
