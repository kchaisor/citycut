import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sitePlanAi, sitePlanSvg } from "./aiPlan";
import { planShadowRings } from "./buildingShadows";
import { SUN_STUDY_HOURS } from "./sunStudyPlan";
import { model } from "./aiExport.test";

describe("plan export artifacts", () => {
  it("writes sun-study .ai and .svg to /opt/cursor/artifacts when CITYCUT_WRITE_ARTIFACTS=1", async () => {
    if (process.env.CITYCUT_WRITE_ARTIFACTS !== "1") return;
    const at = { lat: -37.8045, lon: 145.1065 };
    const date = { ...at, year: 2026, month: 9, day: 22 };
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
    const scale = 2500;
    const outDir = "/opt/cursor/artifacts";
    fs.mkdirSync(outDir, { recursive: true });
    const svg = await sitePlanSvg(model(), scale, undefined, options);
    const ai = await sitePlanAi(model(), scale, undefined, options);
    fs.writeFileSync(path.join(outDir, "site-plan-export.svg"), svg);
    fs.writeFileSync(path.join(outDir, "site-plan-export.ai"), ai);
    expect(svg.length).toBeGreaterThan(500);
    expect(ai.length).toBeGreaterThan(500);
  });
});
