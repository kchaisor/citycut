import { describe, expect, it } from "vitest";
import { sitePlanChunks, sitePlanSvg } from "./aiPlan";
import { planShadowRings } from "./buildingShadows";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import { model } from "./aiExport.test";
import type { Pt } from "../types";

const at = { lat: -37.8045, lon: 145.0215 };
const date = { ...at, year: 2026, month: 9, day: 22 };

function squareRing(half: number): Pt[] {
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
    [-half, -half],
  ];
}

describe("site plan export parity", () => {
  it("includes sun-study layers, heliodon markers, and frame annotations", async () => {
    const layers = SUN_STUDY_HOURS.map((hour) => ({
      hour,
      rings: [...planShadowRings(model(), { ...date, hour, minute: 0 }, true)],
    }));
    const options = {
      heliodon: { ...date, hour: 12, minute: 0, sideM: model().sideM, radiusFactor: 1.75 },
      shadows: { ...date, hour: 12, minute: 0 },
      castShadows: false,
      sunStudy: { layers },
      sunStudyDate: date,
    };
    const chunks = sitePlanChunks(model(), 1000, undefined, options);
    const names = new Set(chunks.map((chunk) => chunk.name));
    expect(names.has("Sun path")).toBe(true);
    expect(names.has("North arrow")).toBe(true);
    expect(names.has("Scale bar")).toBe(true);
    expect(SUN_STUDY_HOURS.every((hour) => names.has(`Shadow ${String(hour).padStart(2, "0")}:00`))).toBe(true);
    const sunPath = chunks.find((chunk) => chunk.name === "Sun path");
    expect((sunPath?.ellipses?.length ?? 0)).toBeGreaterThanOrEqual(7);
    const svg = await sitePlanSvg(model(), 1000, undefined, options);
    expect(svg).toContain('inkscape:label="North arrow"');
    expect(svg).toContain('inkscape:label="Scale bar"');
    expect(svg).toContain('inkscape:label="Sun path"');
  });

  it("omits hourly shadow layers for Melbourne when sun study is off", () => {
    const montAlbert = { lat: -37.8045, lon: 145.1065 };
    const studyDate = { ...montAlbert, year: 2026, month: 6, day: 21 };
    const on = sitePlanChunks(model(), 1000, undefined, {
      heliodon: { ...studyDate, hour: 12, minute: 0, sideM: model().sideM },
      shadows: { ...studyDate, hour: 12, minute: 0 },
      sunStudy: {
        layers: SUN_STUDY_HOURS.map((hour) => ({
          hour,
          rings: [...planShadowRings(model(), { ...studyDate, hour, minute: 0 }, true)],
        })),
      },
      sunStudyDate: studyDate,
    });
    const off = sitePlanChunks(model(), 1000, undefined, {
      heliodon: { ...studyDate, hour: 12, minute: 0, sideM: model().sideM },
      shadows: { ...studyDate, hour: 12, minute: 0 },
    });
    expect(on.some((chunk) => /^Shadow \d\d:00$/.test(chunk.name))).toBe(true);
    expect(off.some((chunk) => /^Shadow \d\d:00$/.test(chunk.name))).toBe(false);
  });

  it("writes imported upper roof lines to their own export layer", () => {
    const m = {
      ...model(),
      importedMassingUpperLevels: [{ z: 32, lines: [squareRing(8)] }],
    };
    const chunks = sitePlanChunks(m, 1000);
    const upper = chunks.find((chunk) => chunk.name === "Imported::Upper levels");
    expect(upper?.paths?.length).toBe(1);
  });
});
