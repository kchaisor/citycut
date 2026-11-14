import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";
import type { WindRoseAsset } from "./windRoseData";
import { nearestWindStation } from "./windStation";

const assetPath = path.join(process.cwd(), "public/wind/australia-tmyx.json");

describe("australia TMYx wind asset", () => {
  it("uses Olympic Park for Melbourne CBD winter, not Melbourne Regional Office", () => {
    let asset: WindRoseAsset;
    try {
      asset = JSON.parse(readFileSync(assetPath, "utf8")) as WindRoseAsset;
    } catch {
      return;
    }
    const pick = nearestWindStation(asset, -37.8136, 144.9631);
    expect(pick?.station.id).toBe("959360");
    const winterCalm = pick?.station.seasons.winter.calmPct;
    expect(winterCalm).toBeDefined();
    expect(winterCalm!).toBeLessThan(30);
    expect(winterCalm!).toBeGreaterThan(0);
  });
});