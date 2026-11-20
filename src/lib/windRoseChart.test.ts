import { describe, expect, it } from "vitest";
import type { WindPeriodStats } from "./windRose";
import {
  DEFAULT_WIND_ROSE_LAYOUT,
  windRoseGuideLabelPositions,
  windRoseQuietSector,
  windRoseSectorPoint,
  windRoseSectorTip,
  windRoseTipBox,
} from "./windRoseChart";

function roseWith(arms: number[]): WindPeriodStats {
  return {
    period: "annual",
    totalHours: 1,
    calmHours: 0,
    calmPercent: 0,
    sectorFrequency: arms,
    prevailingSector: arms.indexOf(Math.max(...arms)),
    prevailingLabel: "NE",
    prevailingMedianKmh: 10,
    sectorSpeedBins: arms.map((a) => [a / 2, a / 2]),
  };
}

const layout = DEFAULT_WIND_ROSE_LAYOUT;

describe("wind rose guide labels", () => {
  it("puts 33% and 66% on the least-used bearing, not at 45°, when NE dominates", () => {
    const arms = Array.from({ length: 16 }, (_, s) => (s === 2 ? 0.3 : s === 11 ? 0 : 0.04));
    const stats = roseWith(arms);
    expect(windRoseQuietSector(stats)).toBe(11);
    const labels = windRoseGuideLabelPositions(stats, layout);
    expect(labels.map((l) => l.pct)).toEqual([33, 66]);
    for (const [i, frac] of [0.33, 0.66].entries()) {
      const at = windRoseSectorPoint(layout, 11, layout.petalMaxR * frac);
      expect(labels[i]!.sector).toBe(11);
      expect(labels[i]!.x).toBeCloseTo(at.x, 6);
      expect(labels[i]!.y).toBeCloseTo(at.y, 6);
      const ne = windRoseSectorPoint(layout, 2, layout.petalMaxR * frac);
      expect(Math.hypot(labels[i]!.x - ne.x, labels[i]!.y - ne.y)).toBeGreaterThan(20);
    }
  });

  it("recomputes the bearing per dataset and breaks ties toward the quieter neighbours", () => {
    const arms = Array.from({ length: 16 }, () => 0.05);
    arms[6] = 0.01;
    arms[14] = 0.01;
    arms[13] = 0.001;
    expect(windRoseQuietSector(roseWith(arms))).toBe(13);
    arms[13] = 0.03;
    expect(windRoseQuietSector(roseWith(arms))).toBe(14);
  });
});

describe("wind rose tooltip", () => {
  it("leads with the period and drops the median wording", () => {
    expect(windRoseSectorTip(2, 7.2, 4.06, "Annual")).toBe("NE · Annual · 7% of hours · 4.1 m/s");
    expect(windRoseSectorTip(2, 18, 3.9)).toBe("NE · 18% of hours · 3.9 m/s");
    expect(windRoseSectorTip(5, 0, null, "Winter")).toBe("ESE · Winter · 0% of hours · no wind");
  });

  it("pins every sector's box outside the ring, 8 px past R, clear of N/E/S/W", () => {
    const w = 120;
    const h = 18;
    const { cx, cy, outerR, labelR } = layout;
    const cardinals = [
      { x: cx, y: cy - labelR },
      { x: cx + labelR, y: cy },
      { x: cx, y: cy + labelR },
      { x: cx - labelR, y: cy },
    ];
    for (let sector = 0; sector < 16; sector++) {
      const box = windRoseTipBox(layout, sector, w, h);
      const nx = Math.min(Math.max(cx, box.x), box.x + w);
      const ny = Math.min(Math.max(cy, box.y), box.y + h);
      expect(Math.hypot(nx - cx, ny - cy)).toBeGreaterThanOrEqual(outerR + 8 - 1e-6);
      for (const c of cardinals) {
        const clear = c.x + 6 <= box.x || c.x - 6 >= box.x + w || c.y + 7 <= box.y || c.y - 7 >= box.y + h;
        expect(clear, `sector ${sector}`).toBe(true);
      }
    }
    const ne = windRoseTipBox(layout, 2, w, h);
    const at = windRoseSectorPoint(layout, 2, outerR + 8);
    expect(ne.x).toBeCloseTo(at.x, 6);
    expect(ne.y + h).toBeCloseTo(at.y, 6);
  });

  it("flips to the other side when the preferred side runs off screen", () => {
    const box = windRoseTipBox(layout, 12, 120, 18, (b) => b.x >= 0);
    expect(box.flipped).toBe(true);
    expect(box.x).toBeGreaterThan(layout.cx);
  });
});
