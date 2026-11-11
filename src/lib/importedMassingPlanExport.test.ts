import { describe, expect, it } from "vitest";
import { mgaCrs } from "./crsZone";
import { sitePlanChunks } from "./aiPlan";
import { massingDrawingBuildings, massingUpperLevelPlanLines } from "./massingFootprint";
import { clearPlanShadowCache, planShadowRings } from "./buildingShadows";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import { importMassingFixture } from "./massingFixture3dm";
import type { CityModel } from "../types";

const origin = { lon: 151.21512, lat: -33.8572 };
const zone = mgaCrs(origin.lon).zone;
const studyDate = { lat: origin.lat, lon: origin.lon, year: 2026, month: 9, day: 22 };

describe("imported massing plan export shadows", () => {
  it("sun-study .ai chunks include non-empty shadow layers when imported casters exist", async () => {
    const item = await importMassingFixture("separate", origin, zone);
    const buildings = massingDrawingBuildings([item], origin, zone);
    const model: CityModel = {
      placeLabel: "Rozelle",
      center: origin,
      sideM: 400,
      layers: { buildings: true, roads: false, waterGreen: false, trees: false },
      buildings,
      importedMassingUpperLevels: massingUpperLevelPlanLines([item], origin, zone),
      roads: [],
      areas: [],
      trees: [],
      roadKm: 0,
      buildingCapHit: false,
      sourceNote: "test",
    };
    clearPlanShadowCache();
    const layers = SUN_STUDY_HOURS.map((hour) => ({
      hour,
      rings: planShadowRings(model, { ...studyDate, hour, minute: 0 }, true),
    }));
    const shadowRingCount = layers.reduce((sum, layer) => sum + layer.rings.length, 0);
    expect(shadowRingCount).toBeGreaterThan(0);
    const chunks = sitePlanChunks(model, 1000, undefined, {
      shadows: { ...studyDate, hour: 15, minute: 0 },
      castShadows: true,
      sunStudy: { layers },
      sunStudyDate: studyDate,
    });
    const hourChunks = chunks.filter((chunk) => /^Shadow \d\d:00$/.test(chunk.name));
    expect(hourChunks.length).toBeGreaterThan(0);
    expect(hourChunks.some((chunk) => (chunk.paths?.length ?? 0) > 0)).toBe(true);
    expect(chunks.some((chunk) => chunk.name === "Imported massing")).toBe(true);
    expect(chunks.some((chunk) => chunk.name === "Imported::Upper levels")).toBe(true);
  });
});
