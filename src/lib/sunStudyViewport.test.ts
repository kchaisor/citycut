import { describe, expect, it } from "vitest";
import { getColour } from "./colours";
import { sunStudyViewportLighting } from "./sunStudyViewport";

describe("sunStudyViewport", () => {
  it("uses pure white for the solar neutral building fill token", () => {
    expect(getColour("--building-solar-neutral").toUpperCase()).toBe("#FFFFFF");
  });

  it("brightens sun-study shadow lighting and disables tone mapping", () => {
    const base = sunStudyViewportLighting({ showPath: false, castShadows: true });
    const study = sunStudyViewportLighting({ showPath: true, castShadows: true });
    expect(study.sunIntensity).toBeGreaterThan(base.sunIntensity);
    expect(study.fillAmbient).toBeGreaterThan(base.fillAmbient);
    expect(study.noToneMapping).toBe(true);
    expect(base.noToneMapping).toBe(false);
  });
});
